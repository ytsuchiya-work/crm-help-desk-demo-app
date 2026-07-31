"""スケジュール・フィードバック・オンボーディング。"""
from fastapi import APIRouter
from pydantic import BaseModel
from datetime import date
from ..db import query, execute
from ..config import fqtn

router = APIRouter()


@router.get("/schedule")
def get_schedule():
    rows = query(f"""
        SELECT s.schedule_id, s.account_id, a.company_name, s.owner,
               cast(s.date AS STRING) AS date, s.title, s.kind, s.start_time, s.duration_min
        FROM {fqtn('schedule')} s
        LEFT JOIN {fqtn('accounts')} a ON s.account_id = a.account_id
        ORDER BY s.date, s.start_time
    """)
    return {"schedule": rows}


@router.get("/onboarding")
def get_onboarding():
    """オンボーディング中アカウントの進捗（設定良好率を進捗の代理指標に使用）。"""
    rows = query(f"""
        SELECT a.account_id, a.company_name, a.csm_owner,
               round(m.app_config_ok_rate*100, 0) AS progress
        FROM {fqtn('accounts')} a
        LEFT JOIN (
          SELECT account_id, app_config_ok_rate
          FROM {fqtn('usage_metrics')} u
          WHERE week_start = (SELECT max(week_start) FROM {fqtn('usage_metrics')} WHERE account_id = u.account_id)
        ) m ON a.account_id = m.account_id
        WHERE a.status = 'onboarding'
        ORDER BY progress
    """)
    phases = ["キックオフ", "目標設定", "データ移行", "初期設定", "トレーニング", "本稼働"]
    for i, r in enumerate(rows):
        p = r.get("progress") or 0
        idx = min(len(phases) - 1, int(p / 100 * len(phases)))
        r["phase"] = phases[idx]
    return {"onboarding": rows}


@router.get("/feedback")
def list_feedback():
    rows = query(f"""
        SELECT feedback_id, title, detail, priority, status,
               cast(created_at AS STRING) AS created_at, submitted_by
        FROM {fqtn('feedback')} ORDER BY created_at DESC
    """)
    return {"feedback": rows}


class NewFeedback(BaseModel):
    title: str
    detail: str = ""
    priority: str = "中"
    submitted_by: str = "CS運用チーム"


@router.post("/feedback")
def add_feedback(body: NewFeedback):
    last = query(f"SELECT max(feedback_id) AS m FROM {fqtn('feedback')}")
    m = last[0]["m"] if last and last[0]["m"] else "FB-200"
    num = int(str(m).split("-")[-1]) + 1
    fid = f"FB-{num}"
    execute(f"""INSERT INTO {fqtn('feedback')}
        (feedback_id, title, detail, priority, status, created_at, submitted_by)
        VALUES (?, ?, ?, ?, '未対応', ?, ?)""",
        [fid, body.title, body.detail, body.priority, date.today().isoformat(), body.submitted_by])
    return {"ok": True, "feedback_id": fid}


class FeedbackStatus(BaseModel):
    status: str


@router.patch("/feedback/{feedback_id}")
def update_feedback(feedback_id: str, body: FeedbackStatus):
    execute(f"UPDATE {fqtn('feedback')} SET status=? WHERE feedback_id=?", [body.status, feedback_id])
    return {"ok": True}
