"""ヘルプデスクのチケット管理（一覧・詳細・ステータス更新・新規作成）。"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
from ..db import query, execute
from ..config import fqtn

router = APIRouter()


@router.get("/tickets")
def list_tickets(status: str | None = None, priority: str | None = None,
                 account_id: str | None = None, q: str | None = None):
    where = []
    params = []
    if status:
        where.append("t.status = ?"); params.append(status)
    if priority:
        where.append("t.priority = ?"); params.append(priority)
    if account_id:
        where.append("t.account_id = ?"); params.append(account_id)
    if q:
        where.append("t.subject LIKE ?"); params.append(f"%{q}%")
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    rows = query(f"""
        SELECT t.ticket_id, t.account_id, a.company_name, t.subject, t.category,
               t.priority, t.status, t.channel, t.assignee,
               cast(t.created_at AS STRING) AS created_at,
               cast(t.updated_at AS STRING) AS updated_at,
               t.first_response_min, t.resolution_hours, t.csat
        FROM {fqtn('tickets')} t
        LEFT JOIN {fqtn('accounts')} a ON t.account_id = a.account_id
        {clause}
        ORDER BY t.created_at DESC
    """, params)
    return {"tickets": rows}


@router.get("/tickets/stats")
def ticket_stats():
    rows = query(f"""
        SELECT
          count(*) AS total,
          sum(CASE WHEN status IN ('new','open','pending') THEN 1 ELSE 0 END) AS open,
          sum(CASE WHEN status='solved' THEN 1 ELSE 0 END) AS solved,
          sum(CASE WHEN priority IN ('high','urgent') THEN 1 ELSE 0 END) AS high_priority,
          round(avg(csat), 2) AS avg_csat,
          round(avg(first_response_min), 0) AS avg_first_response_min
        FROM {fqtn('tickets')}
    """)
    by_status = query(f"""
        SELECT status, count(*) AS c FROM {fqtn('tickets')} GROUP BY status
    """)
    return {"stats": rows[0] if rows else {}, "by_status": by_status}


@router.get("/tickets/{ticket_id}")
def ticket_detail(ticket_id: str):
    rows = query(f"""
        SELECT t.*, a.company_name
        FROM {fqtn('tickets')} t
        LEFT JOIN {fqtn('accounts')} a ON t.account_id = a.account_id
        WHERE t.ticket_id = ?
    """, [ticket_id])
    if not rows:
        raise HTTPException(404, "ticket not found")
    events = query(f"""
        SELECT cast(event_at AS STRING) AS event_at, author_type, author, body
        FROM {fqtn('ticket_events')} WHERE ticket_id = ? ORDER BY event_at
    """, [ticket_id])
    t = rows[0]
    for k in ("created_at", "updated_at"):
        if t.get(k) is not None:
            t[k] = str(t[k])
    return {"ticket": t, "events": events}


class StatusUpdate(BaseModel):
    status: str
    assignee: str | None = None


@router.patch("/tickets/{ticket_id}")
def update_ticket(ticket_id: str, body: StatusUpdate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if body.assignee:
        execute(f"UPDATE {fqtn('tickets')} SET status=?, assignee=?, updated_at=? WHERE ticket_id=?",
                [body.status, body.assignee, now, ticket_id])
    else:
        execute(f"UPDATE {fqtn('tickets')} SET status=?, updated_at=? WHERE ticket_id=?",
                [body.status, now, ticket_id])
    return {"ok": True}


class NewReply(BaseModel):
    author: str
    body: str


@router.post("/tickets/{ticket_id}/reply")
def add_reply(ticket_id: str, body: NewReply):
    rows = query(f"SELECT account_id FROM {fqtn('tickets')} WHERE ticket_id=?", [ticket_id])
    if not rows:
        raise HTTPException(404, "ticket not found")
    account_id = rows[0]["account_id"]
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    execute(f"""INSERT INTO {fqtn('ticket_events')} (ticket_id, account_id, event_at, author_type, author, body)
                VALUES (?, ?, ?, 'agent', ?, ?)""",
            [ticket_id, account_id, now, body.author, body.body])
    execute(f"UPDATE {fqtn('tickets')} SET updated_at=? WHERE ticket_id=?", [now, ticket_id])
    return {"ok": True}


class NewTicket(BaseModel):
    account_id: str
    subject: str
    category: str = "その他"
    priority: str = "normal"
    channel: str = "web_form"
    assignee: str = "未割当"
    description: str = ""


@router.post("/tickets")
def create_ticket(body: NewTicket):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    # 新しい ID を採番
    last = query(f"SELECT max(ticket_id) AS m FROM {fqtn('tickets')}")
    m = last[0]["m"] if last and last[0]["m"] else "ZD-5000"
    num = int(str(m).split("-")[-1]) + 1
    tid = f"ZD-{num}"
    execute(f"""INSERT INTO {fqtn('tickets')}
        (ticket_id, account_id, subject, category, priority, status, channel, assignee,
         created_at, updated_at, first_response_min, resolution_hours, csat, description)
        VALUES (?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, NULL, NULL, NULL, ?)""",
        [tid, body.account_id, body.subject, body.category, body.priority, body.channel,
         body.assignee, now, now, body.description])
    return {"ok": True, "ticket_id": tid}
