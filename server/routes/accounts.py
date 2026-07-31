"""アカウント一覧・詳細・チャーンスコア・LLM 推奨アクション。"""
from fastapi import APIRouter, HTTPException, Query
from ..db import query
from ..config import fqtn
from ..churn import compute_score
from .. import llm

router = APIRouter()


def _account_row(account_id: str) -> dict:
    rows = query(f"""
        SELECT a.*, c.contract_id, c.start_date, c.end_date, c.loaned_devices,
               c.used_services, c.churn_reason, c.mrr_jpy, c.auto_renew
        FROM {fqtn('accounts')} a
        LEFT JOIN {fqtn('contracts')} c ON a.account_id = c.account_id
        WHERE a.account_id = ?
    """, [account_id])
    if not rows:
        raise HTTPException(404, "account not found")
    return rows[0]


def _metrics(account_id: str) -> list[dict]:
    return query(f"""
        SELECT cast(week_start AS STRING) AS week_start, login_rate, signup_rate,
               attendance_detect_rate, install_rate, app_config_ok_rate, dau, sessions, avg_session_min
        FROM {fqtn('usage_metrics')} WHERE account_id = ? ORDER BY week_start
    """, [account_id])


def _tickets(account_id: str) -> list[dict]:
    return query(f"""
        SELECT ticket_id, subject, category, priority, status, channel, assignee,
               cast(created_at AS STRING) AS created_at, first_response_min, resolution_hours, csat
        FROM {fqtn('tickets')} WHERE account_id = ? ORDER BY created_at DESC
    """, [account_id])


def _score_for(account: dict, metrics: list[dict], tickets: list[dict]) -> dict:
    return compute_score(metrics, tickets, account)


@router.get("/accounts")
def list_accounts(
    q: str | None = None,
    industry: str | None = None,
    status: str | None = None,
    band: str | None = None,
):
    rows = query(f"""
        SELECT a.account_id, a.company_name, a.industry, a.plan, a.status,
               a.csm_owner, a.seats, a.arr_jpy, a.region,
               c.auto_renew, c.used_services, cast(c.start_date AS STRING) AS start_date
        FROM {fqtn('accounts')} a
        LEFT JOIN {fqtn('contracts')} c ON a.account_id = c.account_id
        ORDER BY a.arr_jpy DESC
    """)
    # スコアを付与（軽量：最新週メトリクスとチケット集計を一括取得）
    metrics_all = query(f"""
        SELECT account_id, cast(week_start AS STRING) AS week_start, login_rate, signup_rate,
               attendance_detect_rate, install_rate, app_config_ok_rate
        FROM {fqtn('usage_metrics')} ORDER BY account_id, week_start
    """)
    tickets_all = query(f"""
        SELECT account_id, subject, status, priority, csat, first_response_min
        FROM {fqtn('tickets')}
    """)
    from collections import defaultdict
    m_by = defaultdict(list)
    for r in metrics_all:
        m_by[r["account_id"]].append(r)
    t_by = defaultdict(list)
    for r in tickets_all:
        t_by[r["account_id"]].append(r)

    out = []
    for a in rows:
        sc = compute_score(m_by.get(a["account_id"], []), t_by.get(a["account_id"], []), a)
        a["risk_score"] = sc["risk_score"]
        a["risk_band"] = sc["risk_band"]
        out.append(a)

    # フィルタ
    def keep(a):
        if q and q not in (a["company_name"] or ""):
            return False
        if industry and a["industry"] != industry:
            return False
        if status and a["status"] != status:
            return False
        if band and a["risk_band"] != band:
            return False
        return True

    return {"accounts": [a for a in out if keep(a)]}


@router.get("/accounts/{account_id}")
def account_detail(account_id: str):
    account = _account_row(account_id)
    metrics = _metrics(account_id)
    tickets = _tickets(account_id)
    score = _score_for(account, metrics, tickets)
    return {"account": account, "metrics": metrics, "tickets": tickets, "score": score}


@router.get("/churn/at-risk")
def at_risk():
    """チャーンリスク一覧（スコア降順）。churn_risk/churned を優先しつつ全社を採点。"""
    data = list_accounts()["accounts"]
    ranked = sorted(data, key=lambda a: a["risk_score"], reverse=True)
    return {"accounts": ranked}


@router.post("/accounts/{account_id}/recommend")
def recommend(account_id: str):
    """LLM でチャーン根拠と推奨アクションを生成。"""
    account = _account_row(account_id)
    metrics = _metrics(account_id)
    tickets = _tickets(account_id)
    score = _score_for(account, metrics, tickets)

    latest = metrics[-1] if metrics else {}
    first = metrics[0] if metrics else {}
    metrics_summary = {
        "最新_ログイン率": latest.get("login_rate"),
        "最新_出社検知率": latest.get("attendance_detect_rate"),
        "最新_インストール率": latest.get("install_rate"),
        "最新_設定良好率": latest.get("app_config_ok_rate"),
        "12週前_ログイン率": first.get("login_rate"),
        "12週前_出社検知率": first.get("attendance_detect_rate"),
    }
    tickets_summary = {
        "総チケット数": len(tickets),
        "未解決数": sum(1 for t in tickets if t["status"] in ("new", "open", "pending")),
        "高優先度数": sum(1 for t in tickets if t["priority"] in ("high", "urgent")),
        "平均CSAT": round(sum(t["csat"] for t in tickets if t["csat"]) / max(1, sum(1 for t in tickets if t["csat"])), 2)
                   if any(t["csat"] for t in tickets) else None,
        "解約検討あり": any("解約" in (t["subject"] or "") for t in tickets),
        "直近の件名": [t["subject"] for t in tickets[:5]],
    }
    try:
        result = llm.recommend_actions(account, metrics_summary, tickets_summary, score)
    except Exception as e:
        raise HTTPException(500, f"LLM 呼び出しに失敗しました: {e}")
    return {"score": score, "recommendation": result}
