import type { ReactNode } from 'react'

/** Genie エージェントのレポート用の軽量 Markdown レンダラ。
 * 対応: 見出し(##, ###)、表(| |)、箇条書き(- )、太字(**), 引用リンク([n](url))。
 * 外部ライブラリを増やさないため必要な部分集合のみ実装。 */

function renderInline(text: string, key: string): ReactNode[] {
  // **bold** と [label](url) を処理
  const nodes: ReactNode[] = []
  // まずリンクを分割
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  const pushText = (s: string, k: string) => {
    // 太字
    const parts = s.split(/(\*\*[^*]+\*\*)/g)
    parts.forEach((p, j) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        nodes.push(<strong key={`${k}-b${j}`}>{p.slice(2, -2)}</strong>)
      } else if (p) {
        nodes.push(<span key={`${k}-t${j}`}>{p}</span>)
      }
    })
  }
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) pushText(text.slice(last, m.index), `${key}-pre${i}`)
    nodes.push(
      <a key={`${key}-l${i}`} href={m[2]} target="_blank" rel="noreferrer"
        className="cite-link" title="Genie で根拠を確認">{m[1]}</a>
    )
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) pushText(text.slice(last), `${key}-post`)
  return nodes
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // 表: 連続する | 行をまとめる
    if (line.trim().startsWith('|') && line.includes('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]); i++
      }
      const rows = tableLines
        .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
      // 2行目が区切り(---)ならヘッダ扱い
      const hasSep = rows[1] && rows[1].every((c) => /^-+$/.test(c.replace(/:/g, '')))
      const header = rows[0]
      const bodyRows = hasSep ? rows.slice(2) : rows.slice(1)
      blocks.push(
        <div className="table-wrap" key={`tbl${key++}`} style={{ margin: '10px 0' }}>
          <table className="data" style={{ fontSize: 12 }}>
            <thead><tr>{header.map((h, hi) => <th key={hi}>{h}</th>)}</tr></thead>
            <tbody>
              {bodyRows.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c, `c${ri}-${ci}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // 見出し
    if (line.startsWith('### ')) {
      blocks.push(<h4 key={`h${key++}`} style={{ margin: '12px 0 6px', fontSize: 14 }}>{renderInline(line.slice(4), `h${key}`)}</h4>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      blocks.push(<h3 key={`h${key++}`} style={{ margin: '14px 0 8px', fontSize: 15.5, fontWeight: 800 }}>{renderInline(line.slice(3), `h${key}`)}</h3>)
      i++; continue
    }

    // 箇条書き（連続）
    if (line.trim().startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2)); i++
      }
      blocks.push(
        <ul key={`ul${key++}`} style={{ margin: '6px 0', paddingLeft: 20, lineHeight: 1.8 }}>
          {items.map((it, ii) => <li key={ii}>{renderInline(it, `li${key}-${ii}`)}</li>)}
        </ul>
      )
      continue
    }

    // 空行
    if (line.trim() === '') { i++; continue }

    // 段落
    blocks.push(<p key={`p${key++}`} style={{ margin: '6px 0', lineHeight: 1.75 }}>{renderInline(line, `p${key}`)}</p>)
    i++
  }

  return <div className="markdown">{blocks}</div>
}
