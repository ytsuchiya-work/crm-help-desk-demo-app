import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { api } from '../api'
import { Card, Badge } from '../components/ui'

type Msg = { role: 'user' | 'bot'; text: string; query?: string; table?: { columns: string[]; rows: any[][] } }

const SUGGESTIONS = [
  '解約リスクが高いアカウントを教えて',
  'プラン別の平均ARRは？',
  '出社検知率が最も低い企業トップ5は？',
  '未解決チケットが多い企業は？',
]

export default function Genie() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conv, setConv] = useState<string | undefined>()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { api.genieStatus().then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false)) }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, loading])

  const ask = (text: string) => {
    if (!text.trim() || loading) return
    setMsgs((m) => [...m, { role: 'user', text }])
    setInput('')
    setLoading(true)
    api.genieAsk(text, conv)
      .then((r) => {
        setConv(r.conversation_id)
        setMsgs((m) => [...m, { role: 'bot', text: r.answer, query: r.query, table: r.table }])
      })
      .catch((e) => setMsgs((m) => [...m, { role: 'bot', text: `エラー: ${e.message}` }]))
      .finally(() => setLoading(false))
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Genie</h1>
        <Badge kind="info"><Sparkles size={13} /> AI/BI Genie</Badge>
      </div>
      <p className="page-sub">利用状況やチャーンを自然言語で探索（Databricks Genie Space に接続）</p>

      {enabled === false && (
        <Card className="card-pad" style={{ marginBottom: 16, borderLeft: '3px solid var(--warn)' }}>
          <div style={{ fontSize: 13.5 }}>
            Genie Space が未設定です。デプロイ後、<code>GENIE_SPACE_ID</code> 環境変数を設定すると自然言語クエリが有効になります。
          </div>
        </Card>
      )}

      <Card className="card-pad" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 260px)', minHeight: 420 }}>
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {msgs.length === 0 && (
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
          <div className="chat-log">
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.text}
                {m.query && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.8 }}>生成された SQL</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, marginTop: 6, background: 'var(--bg)', padding: 10, borderRadius: 6 }}><code>{m.query}</code></pre>
                  </details>
                )}
                {m.table && m.table.rows.length > 0 && (
                  <div className="table-wrap" style={{ marginTop: 10 }}>
                    <table className="data" style={{ fontSize: 12 }}>
                      <thead><tr>{m.table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                      <tbody>
                        {m.table.rows.slice(0, 20).map((row, ri) => (
                          <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{String(cell ?? '')}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="bubble bot"><span className="spinner" /> Genie が考えています…</div>}
            <div ref={endRef} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask(input)} placeholder="質問を入力…" disabled={!enabled || loading} />
          <button className="btn primary" onClick={() => ask(input)} disabled={!enabled || loading || !input.trim()}>
            <Send size={16} /> 送信
          </button>
        </div>
      </Card>
    </>
  )
}
