import { useEffect, useState } from 'react'
import { Plus, X, Trash2, Ticket } from 'lucide-react'
import { api } from '../api'
import { Card, Loading, Badge, PriorityBadge, TicketStatusBadge } from '../components/ui'

const DAYS = [
  { date: '2026-07-27', label: '月 7/27' },
  { date: '2026-07-28', label: '火 7/28' },
  { date: '2026-07-29', label: '水 7/29' },
  { date: '2026-07-30', label: '木 7/30' },
  { date: '2026-07-31', label: '金 7/31' },
]
const OWNERS = ['佐藤 美咲', '田中 健一', '鈴木 彩子', '高橋 大輔', '伊藤 直樹']
const TIMES = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '15:30', '16:00', '17:00']

type Item = any

export default function Schedule() {
  const [rows, setRows] = useState<Item[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Item | null>(null)   // 編集対象（新規は空オブジェクト）
  const [ticketOf, setTicketOf] = useState<Item | null>(null) // 紐づくチケット表示対象

  const load = () => {
    setLoading(true)
    api.schedule().then((r) => setRows(r.schedule)).catch(console.error).finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
    api.accounts().then((r) => setAccounts(r.accounts)).catch(console.error)
  }, [])

  const owners = Array.from(new Set([...rows.map((r) => r.owner), ...OWNERS]))
    .filter(Boolean).sort()

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">スケジュール</h1>
          <p className="page-sub">メンバー横断の週間ビューで訪問・架電予定を管理（2026年7月27日〜7月31日）。予定はクリックで編集できます。</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({})}><Plus size={16} /> 予定を追加</button>
      </div>

      <div style={{ display: 'flex', gap: 18, marginBottom: 14, fontSize: 12.5 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: 'var(--accent)' }} /> 確定済み</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: 'var(--warn)' }} /> レコメンド（リスク対応・問い合わせ紐付け）</span>
      </div>

      <Card>
        {loading ? <Loading /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>担当者</th>
                  {DAYS.map((d) => <th key={d.date}>{d.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {owners.map((owner) => (
                  <tr key={owner}>
                    <td style={{ fontWeight: 700, verticalAlign: 'top' }}>{owner}</td>
                    {DAYS.map((d) => {
                      const items = rows.filter((r) => r.owner === owner && r.date === d.date)
                      return (
                        <td key={d.date} style={{ verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {items.map((it) => {
                              const isRec = it.kind === 'recommended'
                              return (
                                <div key={it.schedule_id} onClick={() => setEditing(it)} style={{
                                  padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                                  background: isRec ? 'var(--warn-soft)' : 'var(--accent-soft)',
                                  border: `1px solid ${isRec ? 'var(--warn)' : 'var(--accent)'}`,
                                  color: 'var(--text)',
                                }}>
                                  <div style={{ fontWeight: 600 }}>{it.title}</div>
                                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{it.start_time}・{it.duration_min}分</div>
                                  {isRec && it.ticket_id && (
                                    <button className="btn sm" style={{ marginTop: 6, padding: '3px 8px', fontSize: 11 }}
                                      onClick={(e) => { e.stopPropagation(); setTicketOf(it) }}>
                                      <Ticket size={12} /> 紐づく問い合わせ
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <ScheduleEditor
          item={editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
      {ticketOf && <LinkedTicket item={ticketOf} onClose={() => setTicketOf(null)} />}
    </>
  )
}

function ScheduleEditor({ item, accounts, onClose, onSaved }: {
  item: Item; accounts: any[]; onClose: () => void; onSaved: () => void
}) {
  const isNew = !item.schedule_id
  const [form, setForm] = useState({
    account_id: item.account_id || (accounts[0]?.account_id ?? ''),
    owner: item.owner || OWNERS[0],
    date: item.date || DAYS[0].date,
    title: item.title || '',
    kind: item.kind || 'confirmed',
    ticket_id: item.ticket_id || '',
    start_time: item.start_time || '10:00',
    duration_min: item.duration_min || 30,
  })
  const [saving, setSaving] = useState(false)
  const [tickets, setTickets] = useState<any[]>([])

  // 選択中のアカウントのチケット（レコメンド紐付け用）
  useEffect(() => {
    if (form.account_id) {
      api.tickets({ account_id: form.account_id }).then((r) => setTickets(r.tickets)).catch(() => setTickets([]))
    }
  }, [form.account_id])

  const save = () => {
    if (!form.title.trim()) return
    setSaving(true)
    const body = { ...form, ticket_id: form.kind === 'recommended' && form.ticket_id ? form.ticket_id : null }
    const p = isNew ? api.createSchedule(body) : api.updateSchedule(item.schedule_id, body)
    p.then(onSaved).finally(() => setSaving(false))
  }
  const remove = () => {
    if (!confirm('この予定を削除しますか？')) return
    setSaving(true)
    api.deleteSchedule(item.schedule_id).then(onSaved).finally(() => setSaving(false))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <div style={{ fontWeight: 800, fontSize: 17 }}>{isNew ? '予定を追加' : '予定を編集'}</div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">タイトル</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="予定のタイトル" />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">担当者</label>
              <select className="select" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
                {OWNERS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">企業</label>
              <select className="select" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.company_name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">日付</label>
              <select className="select" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}>
                {DAYS.map((d) => <option key={d.date} value={d.date}>{d.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">開始時刻</label>
              <select className="select" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })}>
                {TIMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ width: 90 }}>
              <label className="field-label">所要(分)</label>
              <select className="select" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) })}>
                {[15, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">種別</label>
            <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="confirmed">確定済み</option>
              <option value="recommended">レコメンド（リスク対応）</option>
            </select>
          </div>
          {form.kind === 'recommended' && (
            <div>
              <label className="field-label">紐づく問い合わせ（任意）</label>
              <select className="select" value={form.ticket_id} onChange={(e) => setForm({ ...form, ticket_id: e.target.value })}>
                <option value="">選択なし</option>
                {tickets.map((t) => <option key={t.ticket_id} value={t.ticket_id}>{t.ticket_id}：{t.subject}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            {!isNew ? (
              <button className="btn" style={{ color: 'var(--danger)' }} onClick={remove} disabled={saving}><Trash2 size={15} /> 削除</button>
            ) : <span />}
            <button className="btn primary" onClick={save} disabled={saving || !form.title.trim()}>{isNew ? '追加する' : '保存する'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LinkedTicket({ item, onClose }: { item: Item; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>このレコメンドの根拠となった問い合わせ</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{item.title}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="card-pad">
          {item.ticket_id ? (
            <Card className="card-pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{item.ticket_id}</span>
                {item.ticket_priority && <PriorityBadge priority={item.ticket_priority} />}
                {item.ticket_status && <TicketStatusBadge status={item.ticket_status} />}
                {item.ticket_category && <span className="chip">{item.ticket_category}</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{item.ticket_subject || '（件名不明）'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8 }}>
                {item.company_name} からのこの問い合わせを起点に、リスク対応の予定がレコメンドされています。
              </div>
              <div style={{ marginTop: 12 }}>
                <Badge kind="info">ヘルプデスクの「{item.ticket_id}」を確認して対応してください</Badge>
              </div>
            </Card>
          ) : (
            <div className="empty">紐づく問い合わせはありません</div>
          )}
        </div>
      </div>
    </div>
  )
}
