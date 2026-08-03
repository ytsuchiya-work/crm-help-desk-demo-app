"""Genie Conversation API プロキシ。UC スキーマ上の Genie Space に自然言語で問い合わせる。

チャット履歴は UC テーブル genie_history に永続化し、セッションが切れても
過去の問い合わせ履歴を確認できるようにする。
"""
import time
import uuid
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..config import get_workspace_client, GENIE_SPACE_ID, fqtn
from ..db import query, execute

router = APIRouter()

# フォローアップ質問の候補（回答内容に応じて出し分け）
_FOLLOWUP_POOL = [
    "この中で ARR が最も大きいアカウントは？",
    "担当 CSM ごとの内訳を教えて",
    "直近30日で新規に発生した問い合わせは？",
    "プラン別に集計するとどうなる？",
    "解約検討の問い合わせがあるアカウントは？",
    "出社検知率が下降しているアカウントは？",
    "未解決チケットが多い順に教えて",
    "平均 CSAT が低いアカウントTOP5は？",
]


class GenieAsk(BaseModel):
    message: str
    conversation_id: str | None = None


def _poll_message(w, space_id, conversation_id, message_id, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        msg = w.genie.get_message(space_id, conversation_id, message_id)
        status = getattr(msg.status, "value", str(msg.status)) if msg.status else ""
        if status in ("COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"):
            return msg
        time.sleep(2)
    raise HTTPException(504, "Genie 応答がタイムアウトしました")


def _save_history(conversation_id: str, role: str, content: str, query_sql: str | None):
    """履歴を UC に保存。失敗してもチャット自体は継続させる。"""
    try:
        hid = "GH-" + uuid.uuid4().hex[:12]
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        execute(f"""INSERT INTO {fqtn('genie_history')}
            (history_id, conversation_id, role, content, query, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            [hid, conversation_id, role, content, query_sql, now])
    except Exception:
        pass


def _followups(answer: str) -> list[str]:
    """回答テキストに応じて追加確認質問を最大3件提示。"""
    import random
    picks = list(_FOLLOWUP_POOL)
    random.shuffle(picks)
    return picks[:3]


@router.get("/genie/status")
def genie_status():
    return {"enabled": bool(GENIE_SPACE_ID), "space_id": GENIE_SPACE_ID}


@router.get("/genie/history")
def genie_history():
    """保存済みのチャット履歴を時系列で返す（セッションを跨いで参照可能）。"""
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


@router.post("/genie/ask")
def genie_ask(body: GenieAsk):
    if not GENIE_SPACE_ID:
        raise HTTPException(400, "Genie Space が未設定です（GENIE_SPACE_ID）。")
    w = get_workspace_client()
    try:
        if body.conversation_id and not body.conversation_id.startswith("seed-"):
            wait = w.genie.create_message(GENIE_SPACE_ID, body.conversation_id, body.message)
            conversation_id = body.conversation_id
            message_id = wait.message_id if hasattr(wait, "message_id") else wait.id
            msg = _poll_message(w, GENIE_SPACE_ID, conversation_id, message_id)
        else:
            wait = w.genie.start_conversation(GENIE_SPACE_ID, body.message)
            conversation_id = wait.conversation_id
            message_id = wait.message_id
            msg = _poll_message(w, GENIE_SPACE_ID, conversation_id, message_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Genie 呼び出しに失敗しました: {e}")

    answer_text = ""
    table = None
    query_sql = None
    has_query = False
    for att in (msg.attachments or []):
        if getattr(att, "text", None) and att.text and att.text.content:
            answer_text += att.text.content + "\n"
        if getattr(att, "query", None) and att.query:
            has_query = True
            query_sql = att.query.query
            if att.query.description:
                answer_text += att.query.description + "\n"

    # クエリ結果を取得（SDK 0.41 はメッセージ単位でメタデータを返す。
    # data_array は空で statement_id 経由の取得が必要なため Statement Execution API で取る）
    if has_query:
        try:
            result = w.genie.get_message_query_result(GENIE_SPACE_ID, conversation_id, msg.id)
            sd = result.statement_response
            if sd and sd.manifest and sd.manifest.schema:
                schema_cols = sd.manifest.schema.columns
                cols = [c.name for c in schema_cols]
                types = [getattr(c.type_name, "value", str(c.type_name)) if c.type_name else "STRING"
                         for c in schema_cols]
                rows = []
                if sd.result and sd.result.data_array:
                    rows = sd.result.data_array
                elif sd.statement_id:
                    # 結果本体は Statement Execution API から取得
                    full = w.statement_execution.get_statement(sd.statement_id)
                    if full.result and full.result.data_array:
                        rows = full.result.data_array
                if rows:
                    table = {"columns": cols, "types": types, "rows": rows}
        except Exception:
            pass

    answer = answer_text.strip() or "（回答テキストなし）"
    followups = _followups(answer)

    # 履歴を保存（ユーザー質問 + Bot 回答）
    _save_history(conversation_id, "user", body.message, None)
    _save_history(conversation_id, "bot", answer, query_sql)

    return {
        "conversation_id": conversation_id,
        "message_id": msg.id,
        "answer": answer,
        "query": query_sql,
        "table": table,
        "followups": followups,
    }
