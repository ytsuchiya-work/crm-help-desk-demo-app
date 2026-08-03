import { useEffect, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Send, Sparkles, History, Trash2, BarChart3, Table as TableIcon, MessageSquare, Bot } from 'lucide-react'
import { api } from '../api'
import { Card, Badge } from '../components/ui'
import Markdown from '../components/Markdown'

type GTable = { columns: string[]; types?: string[]; rows: any[][] }
type Mode = 'chat' | 'agent'
type Msg = {
  role: 'user' | 'bot'
  mode?: Mode
  text: string
  query?: string | null
  table?: GTable | null
  viz?: any | null
  followups?: string[]
  reasoning?: string[]
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
      (!t && table.rows.every((r) => r[i] == null || !isNaN(Number(r[i]))))
    if (isNum) numericCols.push(i)
    else if (labelCol === -1) labelCol = i
  })
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

const SUGGESTIONS_CHAT = [
  '解約リスクが高いアカウントを教えて',
  'プラン別の平均ARRは？',
  '出社検知率が最も低い企業トップ5は？',
  '未解決チケットが多い企業は？',
]
const SUGGESTIONS_AGENT = [
  '解約リスクのアカウントを分析して',
  '直近のチャーン傾向と要因をまとめて',
  '高リスク顧客への打ち手を提案して',
]

/** クエリ結果を表／グラフで切替表示。beta 可視化 spec があればそれを、無ければクライアント描画。 */
function GenieResult({ table, viz }: { table: GTable; viz?: any | null }) {
  const canChart = !!chartInfo(table)
  const [view, setView] = useState<'chart' | 'table'>(canChart || viz ? 'chart' : 'table')
  const hasChart = canChart || !!viz

  return (
    <div style={{ marginTop: 10 }}>
      {hasChart && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          <button className={`btn sm ${view === 'chart' ? 'primary' : ''}`} onClick={() => setView('chart')}>
            <BarChart3 size={13} /> グラフ
          </button>
          <button className={`btn sm ${view === 'table' ? 'primary' : ''}`} onClick={() => setView('table')}>
            <TableIcon size={13} /> 表
          </button>
          {viz && <Badge kind="info">Genie 可視化</Badge>}
        </div>
      )}
      {view === 'chart' && hasChart ? (
        viz ? <GenieVizSpec viz={viz} fallback={canChart ? <GenieChart table={table} /> : null} /> : <GenieChart table={table} />
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

/** beta download-visualization の結果を表示（画像 or spec）。未対応形式はフォールバック。 */
function GenieVizSpec({ viz, fallback }: { viz: any; fallback: React.ReactNode }) {
  if (viz.kind === 'binary' && viz.content_type?.startsWith('image')) {
    return <img src={`data:${viz.content_type};base64,${viz.data_b64}`} alt="Genie 可視化"
      style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8 }} />
  }
  // JSON spec（Vega-Lite 等）はこのデモでは簡易にフォールバックのグラフを使う
  return <>{fallback}</>
}

export default function Genie() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [mode, setMode] = useState<Mode>('chat')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conv, setConv] = useState<string | undefined>()
  const [agentConv, setAgentConv] = useState<string | undefined>()
  const [histLoaded, setHistLoaded] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.genieStatus().then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false))
    api.genieHistory().then((r) => {
      const hist: Msg[] = (r.history || []).map((h: any) => {
        const isAgent = typeof h.content === 'string' && h.content.startsWith('[agent] ')
        return {
          role: h.role === 'user' ? 'user' : 'bot',
          mode: isAgent ? 'agent' : 'chat',
          text: isAgent ? h.content.slice(8) : h.content,
          query: h.query,
          historical: true,
        }
      })
      setMsgs(hist)
    }).catch(() => { /* noop */ }).finally(() => setHistLoaded(true))
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, loading])

  const ask = (text: string) => {
    if (!text.trim() || loading) return
    setMsgs((m) => [...m, { role: 'user', mode, text }])
    setInput('')
    setLoading(true)
    if (mode === 'agent') {
      api.genieAgent(text, agentConv)
        .then((r) => {
          setAgentConv(r.conversation_id)
          setMsgs((m) => [...m, { role: 'bot', mode: 'agent', text: r.report, reasoning: r.reasoning }])
        })
        .catch((e) => setMsgs((m) => [...m, { role: 'bot', mode: 'agent', text: `エラー: ${e.message}` }]))
        .finally(() => setLoading(false))
    } else {
      api.genieAsk(text, conv)
        .then((r) => {
          setConv(r.conversation_id)
          setMsgs((m) => [...m, { role: 'bot', mode: 'chat', text: r.answer, query: r.query, table: r.table, viz: r.viz, followups: r.followups }])
        })
        .catch((e) => setMsgs((m) => [...m, { role: 'bot', mode: 'chat', text: `エラー: ${e.message}` }]))
        .finally(() => setLoading(false))
    }
  }

  const clearHistory = () => {
    if (!confirm('保存済みのチャット履歴をすべて削除しますか？')) return
    api.clearGenieHistory().then(() => { setMsgs([]); setConv(undefined); setAgentConv(undefined) }).catch(console.error)
  }

  const lastBot = [...msgs].reverse().find((m) => m.role === 'bot' && !m.historical)
  const followups = !loading && mode === 'chat' && lastBot?.followups?.length ? lastBot.followups : []
  const suggestions = mode === 'agent' ? SUGGESTIONS_AGENT : SUGGESTIONS_CHAT

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="page-title" style={{ margin: 0 }}>Genie</h1>
          <Badge kind="info"><Sparkles size={13} /> AI/BI Genie</Badge>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* モード切替トグル */}
          <div className="mode-toggle">
            <button className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')}>
              <MessageSquare size={14} /> チャット
            </button>
            <button className={mode === 'agent' ? 'active' : ''} onClick={() => setMode('agent')}>
              <Bot size={14} /> エージェント
            </button>
          </div>
          {msgs.length > 0 && (
            <button className="btn sm" onClick={clearHistory}><Trash2 size={14} /> 履歴をクリア</button>
          )}
        </div>
      </div>
      <p className="page-sub">
        {mode === 'chat'
          ? '自然言語で 1 問 1 答（NL → SQL → 結果・グラフ）。チャット履歴は保存され次回も表示されます。'
          : 'エージェントがリサーチプランを立て、複数の SQL を反復実行して引用付きレポートを生成します（beta）。'}
      </p>

      {enabled === false && (
        <Card className="card-pad" style={{ marginBottom: 16, borderLeft: '3px solid var(--warn)' }}>
          <div style={{ fontSize: 13.5 }}>
            Genie Space が未設定です。デプロイ後、<code>GENIE_SPACE_ID</code> 環境変数を設定すると有効になります。
          </div>
        </Card>
      )}

      <Card className="card-pad" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 270px)', minHeight: 420 }}>
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {histLoaded && msgs.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-faint)', marginTop: 40 }}>
              {mode === 'agent' ? <Bot size={30} style={{ marginBottom: 10, opacity: 0.6 }} /> : <Sparkles size={30} style={{ marginBottom: 10, opacity: 0.6 }} />}
              <div style={{ marginBottom: 18 }}>
                {mode === 'agent' ? 'エージェントに分析タスクを依頼してください。' : '自然言語で質問してください。'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {suggestions.map((s) => (
                  <button key={s} className="btn sm" onClick={() => ask(s)} disabled={!enabled}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {msgs.some((m) => m.historical) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: 12, margin: '4px 0 12px' }}>
              <History size={14} /> 保存された過去のチャット履歴
              <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          )}

          <div className="chat-log">
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`} style={{ ...(m.historical ? { opacity: 0.72 } : {}), ...(m.role === 'bot' && m.mode === 'agent' ? { maxWidth: '92%' } : {}) }}>
                {/* エージェントの推論ステップ */}
                {m.role === 'bot' && m.mode === 'agent' && m.reasoning && m.reasoning.length > 0 && (
                  <details style={{ marginBottom: 10 }} open>
                    <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Bot size={13} /> リサーチプラン（{m.reasoning.length} ステップ）
                    </summary>
                    <div style={{ marginTop: 8 }}>
                      {m.reasoning.map((s, si) => (
                        <div className="reasoning-step" key={si}><span className="rs-dot" />{s}</div>
                      ))}
                    </div>
                  </details>
                )}

                {/* 本文: エージェントは Markdown レポート、チャットはプレーン */}
                {m.role === 'bot' && m.mode === 'agent'
                  ? <Markdown text={m.text} />
                  : m.text}

                {m.query && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.8 }}>生成された SQL</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, marginTop: 6, background: 'var(--bg)', padding: 10, borderRadius: 6 }}><code>{m.query}</code></pre>
                  </details>
                )}
                {m.table && m.table.rows.length > 0 && (
                  <GenieResult table={m.table} viz={m.viz} />
                )}
              </div>
            ))}

            {loading && (
              <div className="bubble bot thinking">
                <span className="typing-dots"><span /><span /><span /></span>
                <span className="thinking-text">
                  {mode === 'agent' ? 'エージェントが分析しています…' : 'Genie が考えています…'}
                </span>
              </div>
            )}
            <div ref={endRef} />
          </div>

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
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                ask(input)
              }
            }}
            placeholder={mode === 'agent' ? '分析タスクを入力…（Enter で送信 / Shift+Enter で改行）' : '質問を入力…（Enter で送信 / Shift+Enter で改行）'}
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
