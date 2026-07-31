import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Loading, Badge } from '../components/ui'

export default function Onboarding() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.onboarding().then((r) => setRows(r.onboarding)).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading />

  return (
    <>
      <h1 className="page-title">オンボーディング</h1>
      <p className="page-sub">オンボーディング中アカウントの進捗をフェーズ・進捗率で確認</p>

      <Card>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>アカウント</th><th>フェーズ</th><th>進捗</th><th>担当</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.account_id}>
                  <td style={{ fontWeight: 600 }}>{r.company_name}</td>
                  <td><Badge kind="info">{r.phase}</Badge></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="progress"><div style={{ width: `${r.progress || 0}%` }} /></div>
                      <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{r.progress || 0}%</span>
                    </div>
                  </td>
                  <td>{r.csm_owner}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4}><div className="empty">オンボーディング中のアカウントはありません</div></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
