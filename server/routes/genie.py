"""Genie 連携。2 つのモードを提供する:

1. チャットモード（Conversation API）: /api/2.0/genie/spaces/{id}/... で NL→SQL→結果。
   可視化は beta の download-visualization API で取得し、無効時はクライアント描画にフォールバック。
2. エージェントモード（Genie Agent API, beta）: /api/2.0/genie/agents/{id}/responses（SSE）。
   リサーチプランを立て SQL を反復実行し、引用付きレポートを返す。

いずれも beta REST エンドポイントのため SDK ではなく直接 REST を叩く。
チャット履歴は UC(genie_history) に永続化する。
"""
import json
import time
import uuid
import urllib.request
import urllib.error
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..config import get_token, get_host, GENIE_SPACE_ID, fqtn
from ..db import query, execute

router = APIRouter()


# ---------------------------------------------------------------------------
# REST ヘルパ
# ---------------------------------------------------------------------------
def _req(method: str, path: str, body: dict | None = None, stream: bool = False):
    url = get_host().rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + get_token(),
        "Content-Type": "application/json",
    })
    return urllib.request.urlopen(req, timeout=300)


def _json(method: str, path: str, body: dict | None = None) -> dict:
    try:
        return json.loads(_req(method, path, body).read())
    except urllib.error.HTTPError as e:
        raise HTTPException(e.code, f"Genie API エラー: {e.read().decode()[:300]}")


# ---------------------------------------------------------------------------
# 履歴永続化
# ---------------------------------------------------------------------------
def _save_history(conversation_id: str, role: str, content: str, query_sql: str | None, mode: str = "chat"):
    try:
        hid = "GH-" + uuid.uuid4().hex[:12]
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # content にモードを埋め込まず role で区別。mode はプレフィックスで簡易保持。
        tagged = f"[{mode}] {content}" if mode == "agent" else content
        execute(f"""INSERT INTO {fqtn('genie_history')}
            (history_id, conversation_id, role, content, query, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            [hid, conversation_id, role, tagged, query_sql, now])
    except Exception:
        pass


# ---------------------------------------------------------------------------
# ステータス
# ---------------------------------------------------------------------------
@router.get("/genie/status")
def genie_status():
    return {"enabled": bool(GENIE_SPACE_ID), "space_id": GENIE_SPACE_ID}


@router.get("/genie/history")
def genie_history():
    try:
        rows = query(f"""
            SELECT history_id, conversation_id, role, content, query,
                   cast(created_at AS STRING) AS created_at
            FROM {fqtn('genie_history')}
            ORDER BY created_at, history_id
        """)
    except Exception:
        rows = []
    return {"history": rows}


@router.delete("/genie/history")
def clear_history():
    try:
        execute(f"DELETE FROM {fqtn('genie_history')}")
    except Exception:
        pass
    return {"ok": True}


# ---------------------------------------------------------------------------
# チャットモード（Conversation API）
# ---------------------------------------------------------------------------
class GenieAsk(BaseModel):
    message: str
    conversation_id: str | None = None


def _poll_message(space_id: str, conversation_id: str, message_id: str, timeout: int = 120) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        m = _json("GET", f"/api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}")
        if m.get("status") in ("COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"):
            return m
        time.sleep(2)
    raise HTTPException(504, "Genie 応答がタイムアウトしました")


def _statement_rows(statement_id: str):
    """Statement Execution API から結果本体（列/型/行）を取得。"""
    try:
        sd = _json("GET", f"/api/2.0/sql/statements/{statement_id}")
        manifest = sd.get("manifest") or {}
        schema = manifest.get("schema") or {}
        cols = [c["name"] for c in schema.get("columns", [])]
        types = [c.get("type_name", "STRING") for c in schema.get("columns", [])]
        rows = (sd.get("result") or {}).get("data_array") or []
        if cols:
            return {"columns": cols, "types": types, "rows": rows}
    except Exception:
        pass
    return None


def _download_visualization(space_id, conversation_id, message_id, attachment_id):
    """beta の可視化取得 API。有効なら Vega-Lite 等の spec を返す。無効時は None。"""
    path = (f"/api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}"
            f"/messages/{message_id}/attachments/{attachment_id}/download-visualization")
    try:
        resp = _req("GET", path)
        ct = resp.headers.get("Content-Type", "")
        raw = resp.read()
        if "json" in ct:
            return {"kind": "spec", "content_type": ct, "data": json.loads(raw)}
        # 画像などバイナリの場合は base64
        import base64
        return {"kind": "binary", "content_type": ct, "data_b64": base64.b64encode(raw).decode()}
    except urllib.error.HTTPError:
        # FEATURE_DISABLED 等 → クライアント側フォールバック描画に任せる
        return None
    except Exception:
        return None


@router.post("/genie/ask")
def genie_ask(body: GenieAsk):
    if not GENIE_SPACE_ID:
        raise HTTPException(400, "Genie Space が未設定です（GENIE_SPACE_ID）。")
    sid = GENIE_SPACE_ID
    payload = {"content": body.message, "enable_visualization": True}
    try:
        if body.conversation_id and not body.conversation_id.startswith("seed-"):
            started = _json("POST",
                f"/api/2.0/genie/spaces/{sid}/conversations/{body.conversation_id}/messages", payload)
            conversation_id = body.conversation_id
            message_id = started.get("message_id") or started.get("id")
        else:
            started = _json("POST", f"/api/2.0/genie/spaces/{sid}/start-conversation", payload)
            conversation_id = started["conversation_id"]
            message_id = started["message_id"]
    except HTTPException:
        raise

    msg = _poll_message(sid, conversation_id, message_id)

    answer_text = ""
    table = None
    query_sql = None
    statement_id = None
    viz = None
    followups: list[str] = []

    for att in msg.get("attachments", []):
        aid = att.get("attachment_id")
        if att.get("text") and att["text"].get("content"):
            answer_text += att["text"]["content"] + "\n"
        if att.get("query"):
            q = att["query"]
            query_sql = q.get("query")
            statement_id = q.get("statement_id")
            if q.get("description"):
                answer_text += q["description"] + "\n"
            # 可視化（beta）を試みる
            if aid:
                viz = _download_visualization(sid, conversation_id, message_id, aid)
        if att.get("suggested_questions"):
            followups = att["suggested_questions"].get("questions", []) or []

    if statement_id:
        table = _statement_rows(statement_id)

    answer = answer_text.strip() or "（回答テキストなし）"

    _save_history(conversation_id, "user", body.message, None)
    _save_history(conversation_id, "bot", answer, query_sql)

    return {
        "mode": "chat",
        "conversation_id": conversation_id,
        "message_id": message_id,
        "answer": answer,
        "query": query_sql,
        "table": table,
        "viz": viz,          # beta 可視化 spec（無効なら null → フロントでクライアント描画）
        "followups": followups,
    }


# ---------------------------------------------------------------------------
# エージェントモード（Genie Agent API, beta / SSE）
# ---------------------------------------------------------------------------
class AgentAsk(BaseModel):
    message: str
    conversation_id: str | None = None


@router.post("/genie/agent")
def genie_agent(body: AgentAsk):
    if not GENIE_SPACE_ID:
        raise HTTPException(400, "Genie Space が未設定です（GENIE_SPACE_ID）。")
    sid = GENIE_SPACE_ID
    req_body: dict = {
        "input": [{
            "type": "message", "role": "user",
            "content": [{"type": "input_text", "text": body.message}],
        }],
        "enable_viz": True,
    }
    if body.conversation_id and not body.conversation_id.startswith("seed-"):
        req_body["conversation_id"] = body.conversation_id

    try:
        resp = _req("POST", f"/api/2.0/genie/agents/{sid}/responses", req_body, stream=True)
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:300]
        if e.code in (403, 404) and ("DISABLED" in detail or "not found" in detail.lower()):
            raise HTTPException(400, "エージェントモードはこのワークスペースで有効化されていません（Previews で有効化が必要）。")
        raise HTTPException(e.code, f"エージェント API エラー: {detail}")

    # SSE をパースして最終レスポンスを取り出す
    final = None
    reasoning_steps: list[str] = []
    for raw in resp:
        line = raw.decode(errors="ignore").strip()
        if not line.startswith("data:"):
            continue
        try:
            obj = json.loads(line[5:].strip())
        except Exception:
            continue
        t = obj.get("type")
        if t == "response.output_item.done":
            it = obj.get("item", {})
            if it.get("type") == "reasoning":
                for c in it.get("content", []):
                    if c.get("text"):
                        reasoning_steps.append(c["text"])
        elif t in ("response.completed", "response.failed"):
            final = obj

    if not final:
        raise HTTPException(500, "エージェントから応答を取得できませんでした。")

    r = final["response"]
    conversation_id = r.get("conversation_id")
    status = r.get("status")

    report_parts: list[str] = []
    tables: list[dict] = []
    for it in r.get("output", []):
        if it.get("type") == "message":
            for c in it.get("content", []):
                if c.get("type") == "output_text" and c.get("text"):
                    report_parts.append(c["text"])
    report = "\n\n".join(report_parts).strip() or "（レポートなし）"

    _save_history(conversation_id or "agent", "user", body.message, None, mode="agent")
    _save_history(conversation_id or "agent", "bot", report, None, mode="agent")

    return {
        "mode": "agent",
        "conversation_id": conversation_id,
        "status": status,
        "reasoning": reasoning_steps,
        "report": report,
    }
