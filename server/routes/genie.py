"""Genie Conversation API プロキシ。UC スキーマ上の Genie Space に自然言語で問い合わせる。"""
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..config import get_workspace_client, GENIE_SPACE_ID

router = APIRouter()


class GenieAsk(BaseModel):
    message: str
    conversation_id: str | None = None


def _poll_message(w, space_id, conversation_id, message_id, timeout=120):
    """メッセージが完了するまでポーリング。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        msg = w.genie.get_message(space_id, conversation_id, message_id)
        status = getattr(msg.status, "value", str(msg.status)) if msg.status else ""
        if status in ("COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"):
            return msg
        time.sleep(2)
    raise HTTPException(504, "Genie 応答がタイムアウトしました")


@router.get("/genie/status")
def genie_status():
    return {"enabled": bool(GENIE_SPACE_ID), "space_id": GENIE_SPACE_ID}


@router.post("/genie/ask")
def genie_ask(body: GenieAsk):
    if not GENIE_SPACE_ID:
        raise HTTPException(400, "Genie Space が未設定です（GENIE_SPACE_ID）。")
    w = get_workspace_client()
    try:
        if body.conversation_id:
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

    # 応答テキストとクエリ結果を抽出
    answer_text = ""
    table = None
    query_sql = None
    for att in (msg.attachments or []):
        if getattr(att, "text", None) and att.text and att.text.content:
            answer_text += att.text.content + "\n"
        if getattr(att, "query", None) and att.query:
            query_sql = att.query.query
            if att.query.description:
                answer_text += att.query.description + "\n"
            # 結果を取得
            try:
                result = w.genie.get_message_attachment_query_result(
                    GENIE_SPACE_ID, conversation_id, msg.id, att.attachment_id)
                sd = result.statement_response
                if sd and sd.result and sd.result.data_array:
                    cols = [c.name for c in sd.manifest.schema.columns]
                    table = {"columns": cols, "rows": sd.result.data_array}
            except Exception:
                pass

    return {
        "conversation_id": conversation_id,
        "message_id": msg.id,
        "answer": answer_text.strip() or "（回答テキストなし）",
        "query": query_sql,
        "table": table,
    }
