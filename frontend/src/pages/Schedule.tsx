import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Loading } from '../components/ui'

const DAYS = [
  { date: '2026-07-27', label: '月 7/27' },
  { date: '2026-07-28', label: '火 7/28' },
  { date: '2026-07-29', label: '水 7/29' },
  { date: '2026-07-30', label: '木 7/30' },
  { date: '2026-07-31', label: '金 7/31' },
]

export default function Schedule() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.schedule().then((r) => setRows(r.schedule)).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading />

  const owners = Array.from(new Set(rows.map((r) => r.owner))).sort()

  return (
    <>
      <h1 className="page-title">スケジュール</h1>
      <p className="page-sub">メンバー横断の週間ビューで訪問・架電予定を俯瞰（2026年7月27日〜7月31日）</p>

      <div style={{ display: 'flex', gap: 18, marginBottom: 14, fontSize: 12.5 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: 'var(--accent)' }} /> 確定済み</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: 'var(--warn)' }} /> レコメンド（リスク対応）</span>
      </div>

      <Card>
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
                          {items.map((it) => (
                            <div key={it.schedule_id} style={{
                              padding: '7px 10px', borderRadius: 8, fontSize: 12,
                              background: it.kind === 'recommended' ? 'var(--warn-soft)' : 'var(--accent-soft)',
                              border: `1px solid ${it.kind === 'recommended' ? 'var(--warn)' : 'var(--accent)'}`,
                              color: 'var(--text)',
                            }}>
                              <div style={{ fontWeight: 600 }}>{it.title}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{it.start_time}・{it.duration_min}分</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
