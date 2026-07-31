import { useEffect, useState } from 'react'
import { Search, RotateCcw, Download } from 'lucide-react'
import { api, yen, bandClass } from '../api'
import { Card, Loading, Badge, StatusBadge } from '../components/ui'

const INDUSTRIES = ['IT・Web', '製造', '小売', '金融', '医療・福祉', '人材', '教育', '物流', '外食', '建設', 'エネルギー', 'コンサル', '商社・卸']
const STATUSES = [
  { v: 'active', l: '運用中' }, { v: 'onboarding', l: 'オンボーディング中' },
  { v: 'churn_risk', l: '解約リスク' }, { v: 'churned', l: '解約済み' }, { v: 'prospect', l: '見込み' },
]
const BANDS = [{ v: '高', l: '高リスク' }, { v: '中', l: '中リスク' }, { v: '低', l: '低リスク' }]

export default function Accounts() {
  const [all, setAll] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [industry, setIndustry] = useState('')
  const [status, setStatus] = useState('')
  const [band, setBand] = useState('')

  const load = () => {
    setLoading(true)
    api.accounts().then((r) => setAll(r.accounts)).catch(console.error).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const filtered = all.filter((a) => {
    if (q && !(a.company_name || '').includes(q)) return false
    if (industry && a.industry !== industry) return false
    if (status && a.status !== status) return false
    if (band && a.risk_band !== band) return false
    return true
  })

  const reset = () => { setQ(''); setIndustry(''); setStatus(''); setBand('') }

  const exportCsv = () => {
    const header = ['企業名', '業界', 'プラン', 'ステータス', 'ARR', 'リスクスコア', 'リスク帯', '担当']
    const lines = filtered.map((a) => [a.company_name, a.industry, a.plan, a.status, a.arr_jpy, a.risk_score, a.risk_band, a.csm_owner].join(','))
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'accounts.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">アカウント</h1>
          <p className="page-sub">条件を組み合わせた絞り込み検索でアカウントの健全性を確認</p>
        </div>
        <button className="btn" onClick={exportCsv}><Download size={15} /> CSVダウンロード</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
        <Card className="card-pad">
          <label className="field-label">フリーワード</label>
          <input className="input" placeholder="企業名など" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16 }} />

          <FilterGroup title="業界">
            {INDUSTRIES.map((i) => (
              <Radio key={i} name="ind" label={i} checked={industry === i} onChange={() => setIndustry(industry === i ? '' : i)} />
            ))}
          </FilterGroup>

          <FilterGroup title="取引ステータス">
            {STATUSES.map((s) => (
              <Radio key={s.v} name="st" label={s.l} checked={status === s.v} onChange={() => setStatus(status === s.v ? '' : s.v)} />
            ))}
          </FilterGroup>

          <FilterGroup title="リスク帯">
            {BANDS.map((b) => (
              <Radio key={b.v} name="bd" label={b.l} checked={band === b.v} onChange={() => setBand(band === b.v ? '' : b.v)} />
            ))}
          </FilterGroup>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn primary" style={{ flex: 1 }}><Search size={15} /> 検索</button>
            <button className="btn" onClick={reset}><RotateCcw size={15} /> リセット</button>
          </div>
        </Card>

        <Card>
          {loading ? <Loading /> : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>企業名</th><th>リスク</th><th>ステータス</th><th>業界</th><th>プラン</th><th>ARR</th><th>担当</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.account_id}>
                      <td style={{ fontWeight: 600 }}>{a.company_name}</td>
                      <td><Badge kind={bandClass(a.risk_band)}>{a.risk_band} {a.risk_score}</Badge></td>
                      <td><StatusBadge status={a.status} /></td>
                      <td>{a.industry}</td>
                      <td>{a.plan}</td>
                      <td>{yen(a.arr_jpy)}</td>
                      <td>{a.csm_owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-muted)' }}>全 {filtered.length} 件</div>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function Radio({ label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}
