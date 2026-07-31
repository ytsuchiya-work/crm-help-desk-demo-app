"""Databricks 基盤モデル (Claude) クライアント。チャーン解説・推奨アクション生成に使用。

依存を軽くするため openai パッケージは使わず、databricks-sdk の
serving_endpoints.query を直接使う（httpx/jiter 等の追加依存を避ける）。
"""
import json
from databricks.sdk.service.serving import ChatMessage, ChatMessageRole
from .config import get_workspace_client, SERVING_ENDPOINT


def _chat(system: str, user: str, max_tokens: int = 1200, temperature: float = 0.4) -> str:
    w = get_workspace_client()
    resp = w.serving_endpoints.query(
        name=SERVING_ENDPOINT,
        messages=[
            ChatMessage(role=ChatMessageRole.SYSTEM, content=system),
            ChatMessage(role=ChatMessageRole.USER, content=user),
        ],
        max_tokens=max_tokens,
        temperature=temperature,
    )
    # choices[0].message.content
    if resp.choices and resp.choices[0].message:
        return resp.choices[0].message.content or ""
    return ""


def recommend_actions(account: dict, metrics: dict, tickets_summary: dict, score: dict) -> dict:
    """チャーンリスクの根拠と推奨アクションを LLM で生成。JSON を返す。"""
    sys = (
        "あなたは SaaS カスタマーサクセスの専門アナリストです。"
        "提供された顧客の利用データ・サポート状況・チャーンスコアをもとに、"
        "解約リスクの根拠を簡潔に説明し、CS/AM 担当者が今週取るべき"
        "具体的な推奨アクションを提案してください。"
        "出力は必ず次の JSON 形式のみ:\n"
        '{"risk_summary": "リスクの要約(2-3文)", '
        '"key_drivers": ["主要因1", "主要因2", "主要因3"], '
        '"recommended_actions": [{"action":"アクション","priority":"高|中|低","rationale":"根拠"}], '
        '"talk_track": "顧客との会話で使える一言"}'
    )
    ctx = {
        "顧客": {
            "企業名": account.get("company_name"),
            "業界": account.get("industry"),
            "プラン": account.get("plan"),
            "ステータス": account.get("status"),
            "ARR_JPY": account.get("arr_jpy"),
            "利用サービス": account.get("used_services"),
            "貸出端末": account.get("loaned_devices"),
            "利用開始日": str(account.get("start_date")),
        },
        "直近利用指標": metrics,
        "サポート状況": tickets_summary,
        "チャーンスコア": score,
    }
    user = "以下のデータに基づき JSON を生成してください。\n" + json.dumps(ctx, ensure_ascii=False, indent=2)

    text = _chat(sys, user).strip()
    # ```json フェンス除去
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        return {"risk_summary": text, "key_drivers": [], "recommended_actions": [], "talk_track": ""}
