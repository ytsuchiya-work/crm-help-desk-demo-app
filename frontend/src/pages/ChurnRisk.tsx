import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Sparkles, X, TrendingDown, AlertTriangle } from 'lucide-react'
import { api, yen, bandClass } from '../api'
import { Card, Loading, Badge, StatusBadge } from '../components/ui'

export default function ChurnRisk() {
  const [rows, setRows] = useState<any[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    api.atRisk().then((r) => setRows(r.accounts)).catch(console.error)
  }, [])

  if (!rows.length) return <Loading />

  const atRisk = rows.filter((r) => r.risk_band !== '低')

  return (
    <>
      <h1 className="page-title">チャーンリスク可視化</h1>
      <p className="page-sub">利用シグナル・サポート状況・契約情報からリスクをスコアリングし、推奨アクションを提案</p>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">高リスク</div>
          <div className="value" style={{ color: 'var(--danger)' }}>{rows.filter((r) => r.risk_band === '高').length}</div>
        </div>
        <div className="kpi">
          <div className="label">中リスク</div>
          <div className="value" style={{ color: 'var(--warn)' }}>{rows.filter((r) => r.risk_band === '中').length}</div>
        </div>
        <div className="kpi">
          <div className="label">リスク対象 ARR 合計</div>
          <div className="value" style={{ fontSize: 22 }}>{yen(atRisk.reduce((s, r) => s + (r.arr_jpy || 0), 0))}</div>
        </div>
        <div className="kpi">
          <div className="label">全アカウント数</div>
          <div className="value">{rows.length}</div>
        </div>
      </div>

      <Card>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 130 }}>リスクスコア</th>
                <th>企業名</th>
                <th>ステータス</th>
                <th>業界</th>
                <th>プラン</th>
                <th>ARR</th>
                <th>担当</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.account_id} className="clickable" onClick={() => setSelected(r.account_id)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <RiskBar score={r.risk_score} />
                      <Badge kind={bandClass(r.risk_band)}>{r.risk_score}</Badge>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.company_name}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.industry}</td>
                  <td>{r.plan}</td>
                  <td>{yen(r.arr_jpy)}</td>
                  <td>{r.csm_owner}</td>
                  <td>
                    <button className="btn sm primary" onClick={(e) => { e.stopPropagation(); setSelected(r.account_id) }}>
                      <Sparkles size={14} /> 分析
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && <ChurnDrawer accountId={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

function RiskBar({ score }: { score: number }) {
  const color = score >= 60 ? 'var(--danger)' : score >= 35 ? 'var(--warn)' : 'var(--ok)'
  return (
    <div className="progress" style={{ width: 70 }}>
      <div style={{ width: `${score}%`, background: color }} />
    </div>
  )
}

function ChurnDrawer({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<any>(null)
  const [rec, setRec] = useState<any>(null)
  const [loadingRec, setLoadingRec] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api.accountDetail(accountId).then(setDetail).catch(console.error)
  }, [accountId])

  const runRecommend = () => {
    setLoadingRec(true); setErr(null)
    api.recommend(accountId)
      .then((r) => setRec(r.recommendation))
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingRec(false))
  }

  if (!detail) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal card-pad" onClick={(e) => e.stopPropagation()}><Loading /></div>
      </div>
    )
  }

  const a = detail.account
  const score = detail.score
  const metrics = detail.metrics
  const chartData = metrics.map((m: any) => ({
    week: m.week_start.slice(5),
    login: Math.round(m.login_rate * 100),
    detect: Math.round(m.attendance_detect_rate * 100),
    install: Math.round(m.install_rate * 100),
  }))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-head">
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{a.company_name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{a.industry}・{a.plan}・{a.csm_owner}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="card-pad">
          {/* リスクスコア */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
            <div className="risk-meter">
              <div className="risk-num" style={{ color: score.risk_band === '高' ? 'var(--danger)' : score.risk_band === '中' ? 'var(--warn)' : 'var(--ok)' }}>
                {score.risk_score}
              </div>
              <div>
                <Badge kind={bandClass(score.risk_band)}>リスク {score.risk_band}</Badge>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>チャーンスコア（0-100）</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingDown size={15} /> リスク要因
              </div>
              <div className="pill-row">
                {score.reasons.length ? score.reasons.map((r: string, i: number) => (
                  <span className="chip" key={i}>{r}</span>
                )) : <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>目立ったリスク要因はありません</span>}
              </div>
            </div>
          </div>

          {/* 契約情報 */}
          <div className="kv" style={{ marginBottom: 20 }}>
            <span className="k">契約ID</span><span>{a.contract_id || '—'}</span>
            <span className="k">利用開始日</span><span>{a.start_date || '—'}</span>
            <span className="k">利用終了日</span><span>{a.end_date || '（利用中）'}</span>
            <span className="k">利用サービス</span><span>{a.used_services || '—'}</span>
            <span className="k">貸出端末</span><span>{a.loaned_devices || '—'}</span>
            <span className="k">ARR</span><span>{yen(a.arr_jpy)}（自動更新: {a.auto_renew ? 'オン' : 'オフ'}）</span>
          </div>

          {/* 利用トレンド */}
          <h3 className="section-title">利用トレンド（直近12週）</h3>
          <div style={{ height: 200, marginBottom: 20 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0b7a4b" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0b7a4b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="login" name="ログイン率" stroke="#0b7a4b" fill="url(#g1)" strokeWidth={2} />
                <Area type="monotone" dataKey="detect" name="出社検知率" stroke="#2563a8" fill="transparent" strokeWidth={2} />
                <Area type="monotone" dataKey="install" name="インストール率" stroke="#c9861b" fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* LLM 推奨アクション */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 className="section-title" style={{ margin: 0 }}>AI 推奨アクション</h3>
            <button className="btn primary" onClick={runRecommend} disabled={loadingRec}>
              {loadingRec ? <><span className="spinner" /> 生成中…</> : <><Sparkles size={15} /> 推奨アクションを生成</>}
            </button>
          </div>

          {err && <div className="badge high" style={{ marginBottom: 12 }}><AlertTriangle size={14} /> {err}</div>}

          {rec && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {rec.risk_summary && (
                <Card className="card-pad" style={{ background: 'var(--accent-soft)' }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>{rec.risk_summary}</div>
                </Card>
              )}
              {rec.key_drivers?.length > 0 && (
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>主要因</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.8 }}>
                    {rec.key_drivers.map((d: string, i: number) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
              {rec.recommended_actions?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)' }}>推奨アクション</div>
                  {rec.recommended_actions.map((act: any, i: number) => (
                    <Card className="card-pad" key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{act.action}</div>
                        <Badge kind={bandClass(act.priority)}>{act.priority}</Badge>
                      </div>
                      {act.rationale && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6 }}>根拠: {act.rationale}</div>}
                    </Card>
                  ))}
                </div>
              )}
              {rec.talk_track && (
                <Card className="card-pad" style={{ borderLeft: '3px solid var(--accent)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>💬 トークスクリプト</div>
                  <div style={{ fontSize: 13.5, fontStyle: 'italic' }}>「{rec.talk_track}」</div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
