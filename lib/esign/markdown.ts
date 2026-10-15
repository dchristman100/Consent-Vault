/**
 * Small, safe Markdown renderer for agreement text written by the Sales Desk.
 * Everything is HTML-escaped first; only a fixed set of block and inline forms are produced.
 * Initials markers `[[initials:key|Label]]` split the body into segments so the page can place
 * an initials box exactly where the acknowledgment sits.
 */
export type Segment = { type: 'html'; html: string } | { type: 'initials'; key: string; label: string }

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function inline(s: string): string {
  let t = esc(s)
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
  return t
}

export function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null
  const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = [] } }
  const flushList = () => { if (list) { out.push(`<${list.kind}>` + list.items.map((i) => '<li>' + inline(i) + '</li>').join('') + `</${list.kind}>`); list = null } }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) { flushPara(); flushList(); continue }
    const h = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (h) { flushPara(); flushList(); const lvl = Math.min(4, h[1].length + 1); out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) { flushPara(); flushList(); out.push('<hr>'); continue }
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      flushPara(); flushList()
      const cells = (r: string) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
      const head = cells(trimmed)
      i++
      const rows: string[][] = []
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) { i++; rows.push(cells(lines[i])) }
      out.push('<div class="tbl"><table><thead><tr>' + head.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>')
      continue
    }
    const ul = /^[-*]\s+(.*)$/.exec(trimmed)
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (ul || ol) {
      flushPara()
      const kind = ul ? 'ul' : 'ol'
      if (!list || list.kind !== kind) { flushList(); list = { kind, items: [] } }
      list.items.push((ul || ol)![1])
      continue
    }
    flushList()
    para.push(trimmed)
  }
  flushPara(); flushList()
  return out.join('\n')
}

const MARK = /\[\[initials:([a-z0-9_-]{1,40})(?:\|([^\]]{1,80}))?\]\]/gi

export function segments(md: string): Segment[] {
  const segs: Segment[] = []
  let last = 0
  let m: RegExpExecArray | null
  MARK.lastIndex = 0
  while ((m = MARK.exec(md))) {
    const before = md.slice(last, m.index)
    if (before.trim()) segs.push({ type: 'html', html: mdToHtml(before) })
    segs.push({ type: 'initials', key: m[1].toLowerCase(), label: (m[2] || 'Initials').trim() })
    last = m.index + m[0].length
  }
  const rest = md.slice(last)
  if (rest.trim()) segs.push({ type: 'html', html: mdToHtml(rest) })
  return segs
}

export function initialsKeys(md: string): { key: string; label: string }[] {
  return segments(md).filter((s): s is Extract<Segment, { type: 'initials' }> => s.type === 'initials').map((s) => ({ key: s.key, label: s.label }))
}
