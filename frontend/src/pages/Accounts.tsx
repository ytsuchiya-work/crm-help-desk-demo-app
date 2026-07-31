import { useEffect, useState } from 'react'
import { Search, RotateCcw, Download, Sparkles } from 'lucide-react'
import { api, yen, bandClass } from '../api'
import { Card, Loading, Badge, StatusBadge } from '../components/ui'
import AccountDrawer from '../components/AccountDrawer'

const INDUSTRIES = ['IT・Web', '製造', '小売', '金融', '医療・福祉', '人材', '教育', '物流', '外食', '建設', 'エネルギー', 'コンサル', '商社・卸']
const STATUSES = [
  { v: 'active', l: '運用中' }, { v: 'onboarding', l: 'オンボーディング中' },
  { v: 'churn_risk', l: '解約リスク' }, { v: 'churned', l: '解約済み' }, { v: 'prospect', l: '見込み' },
]
const BANDS = [{ v: '高', l: '高リスク' }, { v: '中', l: '中リスク' }, { v: '低', l: '低リスク' }]

function RiskBar({ score }: { score: number }) {
  const color = score >= 60 ? 'var(--danger)' : score >= 35 ? 'var(--warn)' : 'var(--ok)'
  return (
    <div className="progress" style={{ width: 64 }}>
      <div style={{ width: `${score}%`, background: color }} />
    </div>
  )
}

export default function Accounts() {
  const [all, setAll] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [industry, setIndustry] = useState('')
  const [status, setStatus] = useState('')
  const [band, setBand] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    // atRisk はスコア降順の全アカウント（accounts と同じ項目 + risk_score/risk_band）
    api.atRisk().then((r) => setAll(r.accounts)).catch(console.error).finally(() => setLoading(false))
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

  const highRisk = all.filter((a) => a.risk_band === '高')
  const midRisk = all.filter((a) => a.risk_band === '中')
  const atRiskArr = all.filter((a) => a.risk_band !== '低').reduce((s, r) => s + (r.arr_jpy || 0), 0)

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
          <h1 className="page-title">アカウント／チャーンリスク</h1>
          <p className="page-sub">アカウントの健全性とチャーンリスクを一覧で確認し、行をクリックで詳細・AI推奨アクションを表示</p>
        </div>
        <button className="btn" onClick={exportCsv}><Download size={15} /> CSVダウンロード</button>
      </div>

      {/* チャーンリスク サマリ */}
      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">高リスク</div>
          <div className="value" style={{ color: 'var(--danger)' }}>{highRisk.length}</div>
        </div>
        <div className="kpi">
          <div className="label">中リスク</div>
          <div className="value" style={{ color: 'var(--warn)' }}>{midRisk.length}</div>
        </div>
        <div className="kpi">
          <div className="label">リスク対象 ARR 合計</div>
          <div className="value" style={{ fontSize: 22 }}>{yen(atRiskArr)}</div>
        </div>
        <div className="kpi">
          <div className="label">全アカウント数</div>
          <div className="value">{all.length}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
        <Card className="card-pad">
          <label className="field-label">フリーワード</label>
          <input className="input" placeholder="企業名など" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16 }} />

          <FilterGroup title="業界">
            {INDUSTRIES.map((i) => (
              <Radio key={i} label={i} checked={industry === i} onChange={() => setIndustry(industry === i ? '' : i)} />
            ))}
          </FilterGroup>

          <FilterGroup title="取引ステータス">
            {STATUSES.map((s) => (
              <Radio key={s.v} label={s.l} checked={status === s.v} onChange={() => setStatus(status === s.v ? '' : s.v)} />
            ))}
          </FilterGroup>

          <FilterGroup title="リスク帯">
            {BANDS.map((b) => (
              <Radio key={b.v} label={b.l} checked={band === b.v} onChange={() => setBand(band === b.v ? '' : b.v)} />
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
              <table className="data wide">
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>リスクスコア</th>
                    <th>企業名</th><th>ステータス</th><th>業界</th><th>プラン</th><th>ARR</th><th>担当</th>
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.account_id} className="clickable" onClick={() => setSelected(a.account_id)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <RiskBar score={a.risk_score} />
                          <Badge kind={bandClass(a.risk_band)}>{a.risk_score}</Badge>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{a.company_name}</td>
                      <td><StatusBadge status={a.status} /></td>
                      <td>{a.industry}</td>
                      <td>{a.plan}</td>
                      <td>{yen(a.arr_jpy)}</td>
                      <td>{a.csm_owner}</td>
                      <td>
                        <button className="btn sm primary" onClick={(e) => { e.stopPropagation(); setSelected(a.account_id) }}>
                          <Sparkles size={14} /> 分析
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-muted)' }}>全 {filtered.length} 件</div>
            </div>
          )}
        </Card>
      </div>

      {selected && <AccountDrawer accountId={selected} onClose={() => setSelected(null)} />}
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

function Radio({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}
