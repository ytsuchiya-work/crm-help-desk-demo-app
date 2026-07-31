import { useEffect, useState } from 'react'
import { Plus, X, Send } from 'lucide-react'
import { api } from '../api'
import { Card, Loading, TicketStatusBadge, PriorityBadge } from '../components/ui'

const STATUS_OPTIONS = [
  { v: '', l: 'すべて' }, { v: 'new', l: '新規' }, { v: 'open', l: '対応中' },
  { v: 'pending', l: '保留' }, { v: 'solved', l: '解決済み' }, { v: 'closed', l: 'クローズ' },
]
const PRIORITY_OPTIONS = [
  { v: '', l: 'すべて' }, { v: 'urgent', l: '緊急' }, { v: 'high', l: '高' },
  { v: 'normal', l: '中' }, { v: 'low', l: '低' },
]

export default function Tickets() {
  const [rows, setRows] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const load = () => {
    setLoading(true)
    const params: any = {}
    if (status) params.status = status
    if (priority) params.priority = priority
    if (q) params.q = q
    api.tickets(params).then((r) => setRows(r.tickets)).catch(console.error).finally(() => setLoading(false))
    api.ticketStats().then(setStats).catch(console.error)
  }
  useEffect(load, [status, priority])

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">ヘルプデスク</h1>
          <p className="page-sub">Zendesk 由来の問い合わせを一覧・検索し、ステータスと対応履歴を管理</p>
        </div>
        <button className="btn primary" onClick={() => setShowNew(true)}><Plus size={16} /> チケット作成</button>
      </div>

      {stats && (
        <div className="kpi-grid">
          <Tile label="総チケット" value={stats.stats.total} />
          <Tile label="未解決" value={stats.stats.open} danger />
          <Tile label="高優先度" value={stats.stats.high_priority} />
          <Tile label="平均CSAT" value={stats.stats.avg_csat != null ? `${stats.stats.avg_csat}/5` : '—'} />
          <Tile label="平均一次応答" value={stats.stats.avg_first_response_min != null ? `${Math.round(stats.stats.avg_first_response_min)}分` : '—'} />
        </div>
      )}

      <Card className="card-pad" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="field-label">検索（件名）</label>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="件名で検索…" />
          </div>
          <div style={{ width: 150 }}>
            <label className="field-label">ステータス</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
          <div style={{ width: 130 }}>
            <label className="field-label">優先度</label>
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITY_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
          <button className="btn primary" onClick={load}>検索</button>
        </div>
      </Card>

      <Card>
        {loading ? <Loading /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>チケットID</th><th>企業名</th><th>件名</th><th>カテゴリ</th>
                  <th>優先度</th><th>ステータス</th><th>担当</th><th>CSAT</th><th>作成日時</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.ticket_id} className="clickable" onClick={() => setSelected(t.ticket_id)}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{t.ticket_id}</td>
                    <td>{t.company_name}</td>
                    <td style={{ fontWeight: 600 }}>{t.subject}</td>
                    <td>{t.category}</td>
                    <td><PriorityBadge priority={t.priority} /></td>
                    <td><TicketStatusBadge status={t.status} /></td>
                    <td>{t.assignee}</td>
                    <td>{t.csat != null ? '★'.repeat(t.csat) : '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{t.created_at?.slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-muted)' }}>全 {rows.length} 件</div>
          </div>
        )}
      </Card>

      {selected && <TicketDrawer ticketId={selected} onClose={() => setSelected(null)} onChanged={load} />}
      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load() }} />}
    </>
  )
}

function Tile({ label, value, danger }: { label: string; value: any; danger?: boolean }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value" style={danger && value > 0 ? { color: 'var(--danger)', fontSize: 26 } : { fontSize: 26 }}>{value ?? '—'}</div>
    </div>
  )
}

const STATUS_SET = ['new', 'open', 'pending', 'solved', 'closed']

function TicketDrawer({ ticketId, onClose, onChanged }: { ticketId: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<any>(null)
  const [reply, setReply] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => api.ticketDetail(ticketId).then(setData).catch(console.error)
  useEffect(() => { load() }, [ticketId])

  const changeStatus = (status: string) => {
    setSaving(true)
    api.updateTicket(ticketId, { status }).then(() => { load(); onChanged() }).finally(() => setSaving(false))
  }
  const sendReply = () => {
    if (!reply.trim()) return
    setSaving(true)
    api.replyTicket(ticketId, { author: 'CS運用チーム', body: reply })
      .then(() => { setReply(''); load() }).finally(() => setSaving(false))
  }

  if (!data) {
    return <div className="modal-overlay" onClick={onClose}><div className="modal card-pad" onClick={(e) => e.stopPropagation()}><Loading /></div></div>
  }
  const t = data.ticket
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{t.subject}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{t.ticket_id}・{t.company_name}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="card-pad">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <PriorityBadge priority={t.priority} />
            <TicketStatusBadge status={t.status} />
            <span className="chip">{t.category}</span>
            <span className="chip">{t.channel}</span>
            <span className="chip">担当: {t.assignee}</span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="field-label">ステータス変更</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_SET.map((s) => (
                <button key={s} className={`btn sm ${t.status === s ? 'primary' : ''}`} disabled={saving} onClick={() => changeStatus(s)}>
                  {({ new: '新規', open: '対応中', pending: '保留', solved: '解決済み', closed: 'クローズ' } as any)[s]}
                </button>
              ))}
            </div>
          </div>

          <h3 className="section-title">対応履歴</h3>
          <div className="timeline" style={{ marginBottom: 20 }}>
            {data.events.map((e: any, i: number) => (
              <div key={i} className={`ev ${e.author_type}`}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.event_at?.slice(0, 16)} ・ {e.author}（{e.author_type === 'customer' ? '顧客' : '担当'}）</div>
                <div style={{ fontSize: 13.5, marginTop: 2 }}>{e.body}</div>
              </div>
            ))}
            {!data.events.length && <div className="empty">履歴はありません</div>}
          </div>

          <label className="field-label">返信を追加</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea className="input" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="顧客への返信を入力…" />
            <button className="btn primary" onClick={sendReply} disabled={saving || !reply.trim()}><Send size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [accounts, setAccounts] = useState<any[]>([])
  const [form, setForm] = useState({ account_id: '', subject: '', category: '技術', priority: 'normal', description: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { api.accounts().then((r) => { setAccounts(r.accounts); if (r.accounts[0]) setForm((f) => ({ ...f, account_id: r.accounts[0].account_id })) }) }, [])

  const submit = () => {
    if (!form.subject.trim() || !form.account_id) return
    setSaving(true)
    api.createTicket(form).then(onCreated).finally(() => setSaving(false))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <div style={{ fontWeight: 800, fontSize: 17 }}>チケット作成</div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">企業</label>
            <select className="select" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">件名</label>
            <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="問い合わせ件名" />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">カテゴリ</label>
              <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {['技術', 'アカウント', '請求', '設定', '使い方', '要望', '営業', '解約', 'オンボーディング', 'その他'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">優先度</label>
              <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITY_OPTIONS.filter((o) => o.v).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">詳細</label>
            <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <button className="btn primary" onClick={submit} disabled={saving || !form.subject.trim()}>作成する</button>
        </div>
      </div>
    </div>
  )
}
