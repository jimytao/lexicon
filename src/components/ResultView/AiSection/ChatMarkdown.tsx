/**
 * ChatMarkdown — lightweight Markdown renderer for AI chat replies.
 *
 * Supports: #### / ##### headings, **bold**, *italic*, `inline code`,
 * ```code blocks```, - / * / 1. lists, > blockquotes, --- dividers,
 * and GFM-style pipe tables ( | col | col | ).
 *
 * Headings are intentionally capped at ####/##### to stay compact inside
 * the narrow chat bubbles (AI prompt asks it not to use # / ## / ###).
 */

import React from 'react'

// ─── inline renderer ─────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  // Pattern order matters: code > bold+italic > bold > italic
  const pattern = /(`[^`]+`|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_)/g
  const nodes: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index))
    }
    const full = match[0]
    if (full.startsWith('`')) {
      nodes.push(
        <code key={match.index} className="bg-black/8 dark:bg-white/10 rounded px-1 py-0.5 font-mono text-[0.75em]">
          {full.slice(1, -1)}
        </code>
      )
    } else if (match[2]) {
      // ***bold italic***
      nodes.push(<strong key={match.index}><em>{match[2]}</em></strong>)
    } else if (match[3]) {
      // **bold**
      nodes.push(<strong key={match.index}>{match[3]}</strong>)
    } else if (match[4] || match[5]) {
      // *italic* or _italic_
      nodes.push(<em key={match.index}>{match[4] ?? match[5]}</em>)
    }
    last = match.index + full.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

// ─── table helpers ────────────────────────────────────────────────────────────

/** Split a pipe-table row into trimmed cell strings, ignoring leading/trailing pipes. */
function splitTableRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, '') // strip outer pipes
    .split('|')
    .map(c => c.trim())
}

/** Returns true if the line is a GFM separator row: | --- | :---: | ---: | */
function isSeparatorRow(line: string): boolean {
  return /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(line.trim())
}

/** Returns true if the line looks like a pipe-table row. */
function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') && line.trim().endsWith('|') && line.includes('|', 1)
}

/** Parse alignment from a separator cell: "---" | ":---" | "---:" | ":---:" */
function parseAlign(cell: string): 'left' | 'center' | 'right' {
  const c = cell.trim()
  if (c.startsWith(':') && c.endsWith(':')) return 'center'
  if (c.endsWith(':')) return 'right'
  return 'left'
}

// ─── block tokenizer ─────────────────────────────────────────────────────────

type Token =
  | { type: 'h4'; text: string }
  | { type: 'h5'; text: string }
  | { type: 'hr' }
  | { type: 'fence'; lang: string; code: string }
  | { type: 'blockquote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; headers: string[]; aligns: Array<'left' | 'center' | 'right'>; rows: string[][] }
  | { type: 'paragraph'; text: string }

function tokenize(markdown: string): Token[] {
  const tokens: Token[] = []
  const lines = markdown.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      tokens.push({ type: 'fence', lang, code: codeLines.join('\n') })
      i++
      continue
    }

    // Heading #### or #####
    const h5m = line.match(/^#####\s+(.+)/)
    if (h5m) { tokens.push({ type: 'h5', text: h5m[1] }); i++; continue }
    const h4m = line.match(/^####\s+(.+)/)
    if (h4m) { tokens.push({ type: 'h4', text: h4m[1] }); i++; continue }

    // Collapse any larger headings (#, ##, ###) to h4 so the prompt safety-net applies
    const hAnym = line.match(/^#{1,3}\s+(.+)/)
    if (hAnym) { tokens.push({ type: 'h4', text: hAnym[1] }); i++; continue }

    // HR
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      tokens.push({ type: 'hr' }); i++; continue
    }

    // Blockquote (collapse multi-line)
    if (/^>\s?/.test(line)) {
      const bqLines: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        bqLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      tokens.push({ type: 'blockquote', text: bqLines.join(' ') })
      continue
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s/, ''))
        i++
      }
      tokens.push({ type: 'ul', items }); continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      tokens.push({ type: 'ol', items }); continue
    }

    // GFM pipe table: header row + separator row + body rows
    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headers = splitTableRow(line)
      const aligns = splitTableRow(lines[i + 1]).map(parseAlign)
      i += 2 // skip header + separator
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitTableRow(lines[i]))
        i++
      }
      tokens.push({ type: 'table', headers, aligns, rows })
      continue
    }

    // Blank line — skip
    if (line.trim() === '') { i++; continue }

    // Paragraph — collect consecutive non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^#/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !isTableRow(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length) {
      tokens.push({ type: 'paragraph', text: paraLines.join(' ') })
    }
  }

  return tokens
}

// ─── table renderer ───────────────────────────────────────────────────────────

const alignClass: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

function TableBlock({ headers, aligns, rows }: {
  headers: string[]
  aligns: Array<'left' | 'center' | 'right'>
  rows: string[][]
}) {
  // Tighter padding when there are many columns so everything fits on mobile
  const manyCol = headers.length >= 4
  const cellPad = manyCol ? 'px-1.5 py-1' : 'px-2.5 py-1.5'

  return (
    // No overflow-x-auto — we use table-layout:fixed instead so the table
    // always stays within the bubble width and cells wrap instead of pushing out.
    <div className="rounded-lg border border-border-strong w-full min-w-0">
      <table className="w-full border-collapse text-[0.72em] leading-snug" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          {headers.map((_, ci) => (
            <col key={ci} style={{ width: `${(100 / headers.length).toFixed(1)}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-background-soft border-b border-border-strong">
            {headers.map((h, ci) => (
              <th
                key={ci}
                className={`${cellPad} font-semibold text-foreground break-words ${alignClass[aligns[ci] ?? 'left']}`}
              >
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={ri % 2 === 0 ? 'bg-background' : 'bg-background-soft'}
            >
              {headers.map((_, ci) => (
                <td
                  key={ci}
                  className={`${cellPad} text-foreground border-t border-border break-words ${alignClass[aligns[ci] ?? 'left']}`}
                >
                  {renderInline(row[ci] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── block renderer ──────────────────────────────────────────────────────────

export function ChatMarkdown({ content }: { content: string }) {
  const tokens = tokenize(content)

  return (
    <div className="chat-md text-xs leading-relaxed space-y-1.5">
      {tokens.map((tok, idx) => {
        switch (tok.type) {
          case 'h4':
            return (
              <p key={idx} className="font-semibold text-xs text-foreground mt-2 mb-0.5">
                {renderInline(tok.text)}
              </p>
            )
          case 'h5':
            return (
              <p key={idx} className="font-medium text-xs text-foreground-muted mt-1.5 mb-0">
                {renderInline(tok.text)}
              </p>
            )
          case 'hr':
            return <hr key={idx} className="border-border my-1.5" />
          case 'fence':
            return (
              <pre key={idx} className="bg-black/6 dark:bg-white/8 rounded-lg px-3 py-2 overflow-x-auto text-[0.72em] font-mono leading-snug">
                <code>{tok.code}</code>
              </pre>
            )
          case 'blockquote':
            return (
              <blockquote key={idx} className="border-l-2 border-accent/40 pl-2.5 text-foreground-muted italic">
                {renderInline(tok.text)}
              </blockquote>
            )
          case 'ul':
            return (
              <ul key={idx} className="list-none space-y-0.5 pl-0">
                {tok.items.map((item, j) => (
                  <li key={j} className="flex gap-1.5 items-baseline">
                    <span className="text-accent shrink-0 leading-none mt-0.5">•</span>
                    <span>{renderInline(item)}</span>
                  </li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={idx} className="list-none space-y-0.5 pl-0">
                {tok.items.map((item, j) => (
                  <li key={j} className="flex gap-1.5 items-baseline">
                    <span className="text-accent/70 shrink-0 tabular-nums text-[0.7em] font-medium mt-0.5">{j + 1}.</span>
                    <span>{renderInline(item)}</span>
                  </li>
                ))}
              </ol>
            )
          case 'table':
            return (
              <TableBlock key={idx} headers={tok.headers} aligns={tok.aligns} rows={tok.rows} />
            )
          case 'paragraph':
            return (
              <p key={idx} className="text-xs leading-relaxed">
                {renderInline(tok.text)}
              </p>
            )
        }
      })}
    </div>
  )
}
