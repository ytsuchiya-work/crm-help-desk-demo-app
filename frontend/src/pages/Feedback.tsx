import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { api, bandClass } from '../api'
import { Card, Loading, Badge } from '../components/ui'

const STATUSES = ['未対応', '対応中', '完了', '見送り']

export default function Feedback() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ title: '', detail: '', priority: '中' })
  const [saving, setSaving] = useState(false)

  const load = () => api.feedback().then((r) => setRows(r.feedback)).catch(console.error).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const submit = () => {
    if (!form.title.trim()) return
    setSaving(true)
    api.addFeedback(form).then(() => { setForm({ title: '', detail: '', priority: '中' }); load() }).finally(() => setSaving(false))
  }
  const changeStatus = (id: string, status: string) => api.updateFeedback(id, status).then(load)

  return (
    <>
      <h1 className="page-title">フィードバック</h1>
      <p className="page-sub">製品要望・改善提案を収集し優先度とステータスを管理</p>

      <Card className="card-pad" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label className="field-label">タイトル</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="要望のタイトル" />
          </div>
          <div style={{ width: 120 }}>
            <label className="field-label">優先度</label>
            <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {['高', '中', '低'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="field-label">詳細</label>
          <textarea className="input" rows={2} value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="要望の背景や詳細を記載してください" />
        </div>
        <button className="btn primary" style={{ marginTop: 12 }} onClick={submit} disabled={saving || !form.title.trim()}>
          <Plus size={16} /> フィードバックを追加
        </button>
      </Card>

      {loading ? <Loading /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((f) => (
            <Card className="card-pad" key={f.feedback_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{f.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13.5, marginTop: 4 }}>{f.detail}</div>
                  <div style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 8 }}>{f.created_at}・{f.submitted_by}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Badge kind={bandClass(f.priority)}>{f.priority}</Badge>
                  <select className="select" style={{ width: 120 }} value={f.status} onChange={(e) => changeStatus(f.feedback_id, e.target.value)}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
