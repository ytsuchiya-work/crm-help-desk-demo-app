import { useEffect, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Send, Sparkles, History, Trash2, BarChart3, Table as TableIcon } from 'lucide-react'
import { api } from '../api'
import { Card, Badge } from '../components/ui'

type GTable = { columns: string[]; types?: string[]; rows: any[][] }
type Msg = {
  role: 'user' | 'bot'
  text: string
  query?: string | null
  table?: GTable | null
  followups?: string[]
  historical?: boolean
}

const CHART_COLORS = ['#0b7a4b', '#2563a8', '#c9861b', '#9b59b6', '#d13c3c', '#14a86a']

/** クエリ結果からグラフ化可能かを判定し、ラベル列と数値列を返す。 */
function chartInfo(table: GTable) {
  const numericTypes = ['INT', 'LONG', 'SHORT', 'BYTE', 'INTEGER', 'BIGINT', 'SMALLINT',
    'TINYINT', 'FLOAT', 'DOUBLE', 'DECIMAL']
  const types = table.types || []
  const numericCols: number[] = []
  let labelCol = -1
  table.columns.forEach((_, i) => {
    const t = (types[i] || '').toUpperCase()
    const isNum = numericTypes.includes(t) ||
      // 型不明時は実データで判定
      (!t && table.rows.every((r) => r[i] == null || !isNaN(Number(r[i]))))
    if (isNum) numericCols.push(i)
    else if (labelCol === -1) labelCol = i
  })
  // ラベル列 + 数値列が1つ以上、かつ行数が2〜30 のときのみグラフ化
  if (labelCol === -1 || numericCols.length === 0) return null
  if (table.rows.length < 2 || table.rows.length > 30) return null
  return { labelCol, numericCols }
}

function GenieChart({ table }: { table: GTable }) {
  const info = chartInfo(table)!
  const { labelCol, numericCols } = info
  const data = table.rows.map((r) => {
    const o: any = { __label: String(r[labelCol] ?? '') }
    numericCols.forEach((ci) => { o[table.columns[ci]] = Number(r[ci]) })
    return o
  })
  return (
    <div style={{ height: 260, marginTop: 10 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="__label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={0} angle={-15} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
          <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }} />
          {numericCols.map((ci, k) => (
            <Bar key={ci} dataKey={table.columns[ci]} fill={CHART_COLORS[k % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const SUGGESTIONS = [
  '解約リスクが高いアカウントを教えて',
  'プラン別の平均ARRは？',
  '出社検知率が最も低い企業トップ5は？',
  '未解決チケットが多い企業は？',
]

/** クエリ結果を表／グラフで切り替え表示する。グラフ化可能な場合は既定でグラフ。 */
function GenieResult({ table }: { table: GTable }) {
  const canChart = !!chartInfo(table)
  const [view, setView] = useState<'chart' | 'table'>(canChart ? 'chart' : 'table')

  return (
    <div style={{ marginTop: 10 }}>
      {canChart && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button className={`btn sm ${view === 'chart' ? 'primary' : ''}`} onClick={() => setView('chart')}>
            <BarChart3 size={13} /> グラフ
          </button>
          <button className={`btn sm ${view === 'table' ? 'primary' : ''}`} onClick={() => setView('table')}>
            <TableIcon size={13} /> 表
          </button>
        </div>
      )}
      {view === 'chart' && canChart ? (
        <GenieChart table={table} />
      ) : (
        <div className="table-wrap">
          <table className="data" style={{ fontSize: 12 }}>
            <thead><tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {table.rows.slice(0, 20).map((row, ri) => (
                <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{String(cell ?? '')}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Genie() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conv, setConv] = useState<string | undefined>()
  const [histLoaded, setHistLoaded] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.genieStatus().then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false))
    // 永続化された履歴を読み込む（セッションが切れても過去の問い合わせを表示）
    api.genieHistory().then((r) => {
      const hist: Msg[] = (r.history || []).map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'bot',
        text: h.content,
        query: h.query,
        historical: true,
      }))
      setMsgs(hist)
    }).catch(() => { /* noop */ }).finally(() => setHistLoaded(true))
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, loading])

  const ask = (text: string) => {
    if (!text.trim() || loading) return
    setMsgs((m) => [...m, { role: 'user', text }])
    setInput('')
    setLoading(true)
    api.genieAsk(text, conv)
      .then((r) => {
        setConv(r.conversation_id)
        setMsgs((m) => [...m, { role: 'bot', text: r.answer, query: r.query, table: r.table, followups: r.followups }])
      })
      .catch((e) => setMsgs((m) => [...m, { role: 'bot', text: `エラー: ${e.message}` }]))
      .finally(() => setLoading(false))
  }

  const clearHistory = () => {
    if (!confirm('保存済みのチャット履歴をすべて削除しますか？')) return
    api.clearGenieHistory().then(() => { setMsgs([]); setConv(undefined) }).catch(console.error)
  }

  // 最後の bot メッセージのフォローアップ（生成中でなければ）
  const lastBot = [...msgs].reverse().find((m) => m.role === 'bot' && !m.historical)
  const followups = !loading && lastBot?.followups?.length ? lastBot.followups : []

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="page-title" style={{ margin: 0 }}>Genie</h1>
          <Badge kind="info"><Sparkles size={13} /> AI/BI Genie</Badge>
        </div>
        {msgs.length > 0 && (
          <button className="btn sm" onClick={clearHistory}><Trash2 size={14} /> 履歴をクリア</button>
        )}
      </div>
      <p className="page-sub">利用状況やチャーンを自然言語で探索（Databricks Genie Space に接続）。チャット履歴は保存され、次回アクセス時も表示されます。</p>

      {enabled === false && (
        <Card className="card-pad" style={{ marginBottom: 16, borderLeft: '3px solid var(--warn)' }}>
          <div style={{ fontSize: 13.5 }}>
            Genie Space が未設定です。デプロイ後、<code>GENIE_SPACE_ID</code> 環境変数を設定すると自然言語クエリが有効になります。
          </div>
        </Card>
      )}

      <Card className="card-pad" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 260px)', minHeight: 420 }}>
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {histLoaded && msgs.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-faint)', marginTop: 40 }}>
              <Sparkles size={30} style={{ marginBottom: 10, opacity: 0.6 }} />
              <div style={{ marginBottom: 18 }}>自然言語で質問してください。</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="btn sm" onClick={() => ask(s)} disabled={!enabled}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* 過去履歴の見出し */}
          {msgs.some((m) => m.historical) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: 12, margin: '4px 0 12px' }}>
              <History size={14} /> 保存された過去のチャット履歴
              <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          )}

          <div className="chat-log">
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`} style={m.historical ? { opacity: 0.72 } : undefined}>
                {m.text}
                {m.query && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.8 }}>生成された SQL</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, marginTop: 6, background: 'var(--bg)', padding: 10, borderRadius: 6 }}><code>{m.query}</code></pre>
                  </details>
                )}
                {m.table && m.table.rows.length > 0 && (
                  <GenieResult table={m.table} />
                )}
              </div>
            ))}

            {loading && (
              <div className="bubble bot thinking">
                <span className="typing-dots"><span /><span /><span /></span>
                <span className="thinking-text">Genie が考えています…</span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* 追加で確認した方が良い質問 */}
          {followups.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                追加で確認するとよい質問
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {followups.map((f, i) => (
                  <button key={i} className="followup-chip" onClick={() => ask(f)} disabled={!enabled || loading}>{f}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14, alignItems: 'flex-end' }}>
          <textarea className="input" rows={1} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter 単独で送信、Shift+Enter（および IME 変換確定中）は改行
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                ask(input)
              }
            }}
            placeholder="質問を入力…（Enter で送信 / Shift+Enter で改行）"
            disabled={!enabled || loading}
            style={{ resize: 'none', minHeight: 40, maxHeight: 120, lineHeight: 1.5 }} />
          <button className="btn primary" onClick={() => ask(input)} disabled={!enabled || loading || !input.trim()}>
            <Send size={16} /> 送信
          </button>
        </div>
      </Card>
    </>
  )
}
