"""スケジュール（CRUD）・フィードバック。"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import date
from ..db import query, execute
from ..config import fqtn

router = APIRouter()


@router.get("/schedule")
def get_schedule():
    """予定一覧。レコメンド予定に紐づくチケット情報も併せて返す。"""
    rows = query(f"""
        SELECT s.schedule_id, s.account_id, a.company_name, s.owner,
               cast(s.date AS STRING) AS date, s.title, s.kind, s.ticket_id,
               s.start_time, s.duration_min,
               t.subject AS ticket_subject, t.priority AS ticket_priority,
               t.status AS ticket_status, t.category AS ticket_category
        FROM {fqtn('schedule')} s
        LEFT JOIN {fqtn('accounts')} a ON s.account_id = a.account_id
        LEFT JOIN {fqtn('tickets')} t ON s.ticket_id = t.ticket_id
        ORDER BY s.date, s.start_time
    """)
    return {"schedule": rows}


class ScheduleUpsert(BaseModel):
    account_id: str | None = None
    owner: str
    date: str
    title: str
    kind: str = "confirmed"
    ticket_id: str | None = None
    start_time: str = "10:00"
    duration_min: int = 30


@router.post("/schedule")
def create_schedule(body: ScheduleUpsert):
    last = query(f"SELECT max(schedule_id) AS m FROM {fqtn('schedule')}")
    m = last[0]["m"] if last and last[0]["m"] else "SC-100"
    num = int(str(m).split("-")[-1]) + 1
    sid = f"SC-{num}"
    execute(f"""INSERT INTO {fqtn('schedule')}
        (schedule_id, account_id, owner, date, title, kind, ticket_id, start_time, duration_min)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [sid, body.account_id, body.owner, body.date, body.title, body.kind,
         body.ticket_id, body.start_time, body.duration_min])
    return {"ok": True, "schedule_id": sid}


@router.patch("/schedule/{schedule_id}")
def update_schedule(schedule_id: str, body: ScheduleUpsert):
    rows = query(f"SELECT schedule_id FROM {fqtn('schedule')} WHERE schedule_id=?", [schedule_id])
    if not rows:
        raise HTTPException(404, "schedule not found")
    execute(f"""UPDATE {fqtn('schedule')} SET
        account_id=?, owner=?, date=?, title=?, kind=?, ticket_id=?, start_time=?, duration_min=?
        WHERE schedule_id=?""",
        [body.account_id, body.owner, body.date, body.title, body.kind,
         body.ticket_id, body.start_time, body.duration_min, schedule_id])
    return {"ok": True}


@router.delete("/schedule/{schedule_id}")
def delete_schedule(schedule_id: str):
    execute(f"DELETE FROM {fqtn('schedule')} WHERE schedule_id=?", [schedule_id])
    return {"ok": True}


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
