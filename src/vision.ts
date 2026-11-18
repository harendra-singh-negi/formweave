// Reads a printed form from a picture of a page: the lines to write on, the boxes to tick or fill in, the tables,
// and the printed words OCR found next to them. No model and no network: geometry and a few rules about forms.
// Pure functions over pixels and words, so it runs (and is tested) anywhere.

export interface Gray {
  /** 0 = black … 255 = white, row by row */
  data: Uint8Array
  width: number
  height: number
}
/** Pixels; x1 and y1 are exclusive. */
export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}
export interface Word extends Rect {
  text: string
  /** 0–100, as OCR reports it */
  confidence: number
}
/** A drawn rectangle. `cols` and `rows` are its inner lines: a table, or boxes for one character each. */
export interface Frame extends Rect {
  cols: number[]
  rows: number[]
}
export interface Shapes {
  width: number
  height: number
  /** typical text height in pixels */
  em: number
  /** lines to write on: solid, dashed, dotted or typed underscores */
  rules: Rect[]
  /** small square boxes to tick */
  ticks: Rect[]
  frames: Frame[]
  /** 1 on every pixel of these shapes (a little wider), to clear before OCR */
  mask: Uint8Array
}

export type Kind = 'text' | 'long_text' | 'number' | 'money' | 'date' | 'time' | 'email' | 'phone' | 'yes_no' | 'checkbox' | 'one_of' | 'many_of' | 'signature' | 'file' | 'table'
export type ColumnKind = 'text' | 'number' | 'money' | 'date' | 'yes_no' | 'one_of' | 'checkbox'
export interface SketchColumn {
  key: string
  label: string
  kind: ColumnKind
  options: string[]
}
/** One thing the form asks for. */
export interface SketchField {
  key: string
  label: string
  kind: Kind
  required: boolean
  help: string
  options: string[]
  columns: SketchColumn[]
  maxLength?: number
}
/** A form's outline: what scanning finds, before it becomes a formweave schema. */
export interface Sketch {
  title: string
  sections: { title: string; fields: SketchField[] }[]
}
/** What a page holds, in reading order. */
export type Item = { at: Rect; heading: string } | { at: Rect; field: SketchField }

interface Comp extends Rect {
  id: number
  /** ink pixels */
  n: number
}

// ---- shapes ----

/** Finds lines, tick boxes and drawn rectangles on a page. */
export function findShapes(g: Gray): Shapes {
  const { width: w, height: h } = g
  const ink = binarize(g)
  const { lab, comps } = components(ink, w, h)
  const em = typicalHeight(comps, h)
  const mask = new Uint8Array(w * h)
  const mark = (c: Comp) => {
    for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) if (lab[y * w + x] === c.id) mask[y * w + x] = 1
  }
  const own = (c: Comp) => (x: number, y: number) => lab[y * w + x] === c.id
  const ticks: Rect[] = []
  const frames: Frame[] = []
  const pieces: Comp[] = []
  for (const c of comps) {
    const cw = c.x1 - c.x0
    const ch = c.y1 - c.y0
    if (isTick(c, own(c), em) && !touching(c, ink, w, em)) {
      ticks.push(rect(c))
      mark(c)
      continue
    }
    const frame = asFrame(c, own(c), em)
    if (frame) {
      frames.push(frame)
      mark(c)
      continue
    }
    // thin and flat: a line, a dash, a typed underscore or a dot. Up to a few degrees of tilt is fine.
    if (ch <= Math.max(3, 0.3 * em, 0.06 * cw) && c.n / cw <= Math.max(3, 0.3 * em)) pieces.push(c)
  }
  const rules: Rect[] = []
  for (const ch of chains(pieces, em)) {
    rules.push(rect(ch))
    for (const p of ch.parts) mark(p)
  }
  return { width: w, height: h, em, rules, ticks, frames, mask: dilate(mask, w, h) }
}

/** The page with the shapes painted white, so OCR sees only the printed words. */
export function erase(g: Gray, shapes: Shapes): Gray {
  const data = g.data.slice()
  for (let i = 0; i < data.length; i++) if (shapes.mask[i]) data[i] = 255
  return { data, width: g.width, height: g.height }
}

/** Ink where a pixel is darker than its neighbourhood: copes with shadows and uneven light in photos. */
function binarize({ data, width: w, height: h }: Gray): Uint8Array {
  const r = Math.max(7, Math.round(Math.min(w, h) / 60))
  const W = w + 1
  const sum = new Uint32Array(W * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += data[y * w + x]
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row
    }
  }
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r)
    const yb = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r)
      const xb = Math.min(w, x + r + 1)
      const mean = (sum[yb * W + xb] - sum[ya * W + xb] - sum[yb * W + xa] + sum[ya * W + xa]) / ((yb - ya) * (xb - xa))
      if (data[y * w + x] < mean * 0.82) out[y * w + x] = 1
    }
  }
  return out
}

function components(ink: Uint8Array, w: number, h: number): { lab: Int32Array; comps: Comp[] } {
  const lab = new Int32Array(w * h)
  const stack = new Int32Array(w * h)
  const comps: Comp[] = []
  for (let i = 0; i < w * h; i++) {
    if (!ink[i] || lab[i]) continue
    const id = comps.length + 1
    let top = 0
    stack[top++] = i
    lab[i] = id
    let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0
    while (top) {
      const p = stack[--top]
      const x = p % w
      const y = (p - x) / w
      n++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          const q = ny * w + nx
          if (ink[q] && !lab[q]) {
            lab[q] = id
            stack[top++] = q
          }
        }
      }
    }
    comps.push({ id, x0, y0, x1: x1 + 1, y1: y1 + 1, n })
  }
  return { lab, comps }
}

/** Text height, from the letters: about 1.7 × the median letter height. */
function typicalHeight(comps: Comp[], pageHeight: number): number {
  const hs = comps
    .filter((c) => c.y1 - c.y0 >= 4 && c.y1 - c.y0 <= pageHeight / 15 && c.x1 - c.x0 <= 3 * (c.y1 - c.y0) && c.n >= 8)
    .map((c) => c.y1 - c.y0)
  return hs.length ? Math.min(300, Math.max(8, Math.round(1.7 * median(hs)))) : 20
}

type Own = (x: number, y: number) => boolean

/** Share of positions along each side that have ink within `t` pixels of the edge: [top, bottom, left, right]. */
function sides(c: Rect, own: Own, t: number): number[] {
  const w = c.x1 - c.x0
  const h = c.y1 - c.y0
  const along = (n: number, hit: (i: number) => boolean) => {
    let k = 0
    for (let i = 0; i < n; i++) if (hit(i)) k++
    return k / n
  }
  const band = (from: number, to: number, f: (j: number) => boolean) => {
    for (let j = from; j < to; j++) if (f(j)) return true
    return false
  }
  return [
    along(w, (i) => band(c.y0, Math.min(c.y1, c.y0 + t), (y) => own(c.x0 + i, y))),
    along(w, (i) => band(Math.max(c.y0, c.y1 - t), c.y1, (y) => own(c.x0 + i, y))),
    along(h, (i) => band(c.x0, Math.min(c.x1, c.x0 + t), (x) => own(x, c.y0 + i))),
    along(h, (i) => band(Math.max(c.x0, c.x1 - t), c.x1, (x) => own(x, c.y0 + i))),
  ]
}

/** A small hollow square: four straight sides, ink in every corner, empty inside. */
function isTick(c: Comp, own: Own, em: number): boolean {
  const w = c.x1 - c.x0
  const h = c.y1 - c.y0
  const s = Math.max(w, h)
  if (w < 0.45 * em || h < 0.45 * em || s > 1.8 * em || Math.abs(w - h) > 0.3 * s) return false
  // four straight sides: the curve of a D or an O covers only part of its side
  const t = Math.max(1, Math.round(0.12 * s))
  if (Math.min(...sides(c, own, t)) < 0.85) return false
  const k = Math.max(2, Math.round(0.2 * s))
  const corner = (xa: number, ya: number) => {
    for (let y = ya; y < ya + k; y++) for (let x = xa; x < xa + k; x++) if (own(x, y)) return true
    return false
  }
  if (!corner(c.x0, c.y0) || !corner(c.x1 - k, c.y0) || !corner(c.x0, c.y1 - k) || !corner(c.x1 - k, c.y1 - k)) return false
  let inside = 0
  const m = t + 1
  for (let y = c.y0 + m; y < c.y1 - m; y++) for (let x = c.x0 + m; x < c.x1 - m; x++) if (own(x, y)) inside++
  return inside <= 0.1 * Math.max(1, (w - 2 * m) * (h - 2 * m))
}

/** Ink right beside a box, at its middle: a letter of a word (the D of "Date"), not a box to tick. */
function touching(c: Rect, ink: Uint8Array, w: number, em: number): boolean {
  const g = Math.max(2, Math.round(0.12 * em))
  const ya = c.y0 + Math.round(0.2 * (c.y1 - c.y0))
  const yb = c.y1 - Math.round(0.2 * (c.y1 - c.y0))
  for (let y = ya; y < yb; y++)
    for (let x = c.x0 - g; x < c.x1 + g; x++) {
      if (x >= c.x0 && x < c.x1) continue
      if (x >= 0 && x < w && ink[y * w + x]) return true
    }
  return false
}

/** A drawn rectangle bigger than a tick box, with its inner lines. Solid blocks are not frames. */
function asFrame(c: Comp, own: Own, em: number): Frame | null {
  const w = c.x1 - c.x0
  const h = c.y1 - c.y0
  if (w < 1.5 * em || h < 0.7 * em || c.n > 0.5 * w * h) return null
  const t = Math.max(2, Math.round(0.15 * em))
  if (Math.min(...sides(c, own, t)) < 0.85) return null
  const lines = (n: number, len: number, at: (i: number, j: number) => boolean, from: number) => {
    const found: number[] = []
    let run: number[] = []
    const flush = () => {
      if (run.length) found.push(from + Math.round((run[0] + run[run.length - 1]) / 2))
      run = []
    }
    for (let i = 2 * t; i < n - 2 * t; i++) {
      let k = 0
      for (let j = t; j < len - t; j++) if (at(i, j)) k++
      if (k >= 0.85 * (len - 2 * t)) run.push(i)
      else flush()
    }
    flush()
    return found
  }
  return {
    ...rect(c),
    cols: lines(w, h, (i, j) => own(c.x0 + i, c.y0 + j), c.x0),
    rows: lines(h, w, (i, j) => own(c.x0 + j, c.y0 + i), c.y0),
  }
}

interface Chain extends Rect {
  yc: number
  ink: number
  parts: Comp[]
}

/** Thin pieces at about the same height with short gaps between them make one line. */
function chains(pieces: Comp[], em: number): Chain[] {
  const tol = Math.max(2, 0.25 * em)
  const gap = 0.6 * em
  const open: Chain[] = []
  const done: Chain[] = []
  for (const p of [...pieces].sort((a, b) => a.x0 - b.x0)) {
    for (let i = open.length - 1; i >= 0; i--) if (open[i].x1 + gap < p.x0) done.push(...open.splice(i, 1))
    const yc = (p.y0 + p.y1) / 2
    let best: Chain | undefined
    for (const ch of open)
      if (Math.abs(ch.yc - yc) <= tol && p.x0 >= ch.x1 - 2 && (!best || Math.abs(ch.yc - yc) < Math.abs(best.yc - yc))) best = ch
    if (best) {
      best.x1 = Math.max(best.x1, p.x1)
      best.y0 = Math.min(best.y0, p.y0)
      best.y1 = Math.max(best.y1, p.y1)
      best.yc = yc // follows a slight tilt
      best.ink += p.x1 - p.x0
      best.parts.push(p)
    } else open.push({ ...rect(p), yc, ink: p.x1 - p.x0, parts: [p] })
  }
  return [...done, ...open].filter((ch) => ch.x1 - ch.x0 >= 2 * em && ch.ink >= 0.2 * (ch.x1 - ch.x0))
}

function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1
        }
    }
  return out
}

const rect = (r: Rect): Rect => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 })
const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1]
}

// ---- reading the page ----

interface Phrase extends Rect {
  text: string
  words: Word[]
  used: boolean
}

const KIND_WORDS: [RegExp, Kind][] = [
  [/e-?mail|ईमेल/i, 'email'],
  [/mobile|phone|\btel(?:ephone)?\b|contact no|whatsapp|फ़ोन|फोन|मोबाइल/i, 'phone'],
  [/signature|\bsign(?:ed)?\b|हस्ताक्षर/i, 'signature'],
  [/\bdate\b|\bd\.?o\.?b\b|birth|dated|तिथि|तारीख|दिनांक/i, 'date'],
  [/\btime\b|समय/i, 'time'],
  [/\bage\b|\bqty\b|quantity|how many|number of|no\. of|\byears?\b|आयु|उम्र|संख्या/i, 'number'],
  [/amount|salary|price|\bfees?\b|\bcost\b|income|total|₹|\brs\.?(?=\s|$)|\binr\b|वेतन|राशि|रुपये/i, 'money'],
  [/photo(?:graph)?|attach|upload|फोटो/i, 'file'],
  [/address|remarks?|comments?|description|reason|purpose|पता|टिप्पणी|विवरण/i, 'long_text'],
]
const kindOf = (label: string, otherwise: Kind): Kind => KIND_WORDS.find(([re]) => re.test(label))?.[1] ?? otherwise
const columnKind = (label: string): ColumnKind => {
  const k = kindOf(label, 'text')
  return k === 'number' || k === 'money' || k === 'date' ? k : 'text'
}
const CHOICE_WORDS = /^(yes|no|n\/?a|ok|not ok|done|pass|fail|true|false|हाँ|हां|नहीं|✓|✔|x)$/i

/** "1. Full name*:" → "Full name" */
export function cleanLabel(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[1l|] (?=[a-z])/, 'I ') // OCR reads a capital I as 1 or l
    .replace(/^\(?(?:\d{1,2}|[a-hA-H]|[ivxIVX]{1,4})[.)]\s+/, '')
    .replace(/\*/g, '')
    .replace(/[^\p{L}\p{M}\p{N})\]?]+$/u, '') // trailing colons, dots, quotes and OCR's stray marks (®, ’)
    .replace(/^(.*\([^)]*)$/, '$1)') // "Amount (Rs.):" loses its ")" with the colon
    .trim()
}

function headingLike(p: Phrase, em: number): boolean {
  const letters = p.text.replace(/[^\p{L}]/gu, '')
  const upper = letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()
  const numbered = /^(?:\d{1,2}|[IVX]{1,4}|[A-H])[.)]\s+\S/.test(p.text)
  return p.text.length <= 80 && letters.length >= 2 && !/[:：]$/.test(p.text) && (p.y1 - p.y0 >= 1.3 * em || numbered || upper)
}

const overlapY = (a: Rect, b: Rect) => Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
const overlapX = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
const centerIn = (a: Rect, b: Rect) => (a.x0 + a.x1) / 2 >= b.x0 && (a.x0 + a.x1) / 2 <= b.x1 && (a.y0 + a.y1) / 2 >= b.y0 && (a.y0 + a.y1) / 2 <= b.y1
const box = (rs: Rect[]): Rect => ({
  x0: Math.min(...rs.map((r) => r.x0)),
  y0: Math.min(...rs.map((r) => r.y0)),
  x1: Math.max(...rs.map((r) => r.x1)),
  y1: Math.max(...rs.map((r) => r.y1)),
})

/** Words into text lines, and lines into phrases where a wide gap separates them. */
function phrasesOf(words: Word[], em: number): Phrase[][] {
  const lines: (Rect & { words: Word[] })[] = []
  for (const w of [...words].sort((a, b) => a.y0 + a.y1 - b.y0 - b.y1)) {
    const line = lines.find((l) => overlapY(l, w) >= 0.5 * Math.min(l.y1 - l.y0, w.y1 - w.y0))
    if (line) {
      line.words.push(w)
      Object.assign(line, box([line, w]))
    } else lines.push({ ...rect(w), words: [w] })
  }
  return lines
    .sort((a, b) => a.y0 - b.y0)
    .map((l) => {
      const ws = l.words.sort((a, b) => a.x0 - b.x0)
      const out: Phrase[] = []
      let cur: Word[] = []
      const flush = () => {
        if (cur.length) out.push({ ...box(cur), text: cur.map((w) => w.text).join(' '), words: cur, used: false })
        cur = []
      }
      for (const w of ws) {
        if (cur.length && w.x0 - cur[cur.length - 1].x1 > 1.2 * em) flush()
        cur.push(w)
      }
      flush()
      return out
    })
}

/**
 * What one page asks for, in reading order: headings, and fields with their labels and kinds.
 * `words` are OCR's words on the page with the shapes erased.
 */
export function readPage(shapes: Shapes, ocrWords: Word[]): Item[] {
  const words = ocrWords
    // OCR is sometimes unsure of a perfectly good word ("Address:" right before an erased dotted line); keep those
    .filter((w) => w.confidence >= 35 || /^\p{L}[\p{L}\p{M}'’.-]{2,}[:：.-]?$/u.test(w.text.trim()))
    .map((w) => ({ ...w, text: w.text.replace(/^[|_\s]+|[|_\s]+$/g, '') }))
    .filter((w) => /[\p{L}\p{N}₹$€£?*/]/u.test(w.text))
  const em = shapes.em
  const lines = phrasesOf(words, em)
  const phrases = lines.flat()
  const items: Item[] = []
  const add = (at: Rect, label: string, kind: Kind, extra: Partial<SketchField> = {}) => {
    items.push({ at, field: { key: '', label: cleanLabel(label), kind, required: label.includes('*'), help: '', options: [], columns: [], ...extra } })
  }
  const free = (p: Phrase) => !p.used
  /** Unused phrase ending just left of `r`, on its line. */
  const leftOf = (r: Rect, thin: boolean) =>
    phrases
      .filter((p) => free(p) && p.x1 <= r.x0 + 0.3 * em && r.x0 - p.x1 <= 4 * em)
      .filter((p) => (thin ? (r.y0 + r.y1) / 2 >= p.y0 - 0.2 * em && (r.y0 + r.y1) / 2 <= p.y1 + 0.6 * em : overlapY(p, r) >= 0.4 * Math.min(p.y1 - p.y0, r.y1 - r.y0)))
      .sort((a, b) => b.x1 - a.x1)[0]
  const above = (r: Rect, gap: number) =>
    phrases
      .filter((p) => free(p) && p.y1 <= r.y0 + 0.2 * em && r.y0 - p.y1 <= gap && (overlapX(p, r) > 0 || Math.abs(p.x0 - r.x0) <= 2 * em))
      .sort((a, b) => b.y1 - a.y1)[0]
  const below = (r: Rect, gap: number) =>
    phrases
      .filter((p) => free(p) && p.y0 >= r.y1 - 0.2 * em && p.y0 - r.y1 <= gap && overlapX(p, r) >= 0.3 * (p.x1 - p.x0))
      .sort((a, b) => a.y0 - b.y0)[0]
  const take = (p: Phrase | undefined) => {
    if (p) p.used = true
    return p
  }
  const inside = (r: Rect) => phrases.filter((p) => centerIn(p, r))
  const busy = new Set<Rect>() // rules and ticks already accounted for

  // tables, and boxes to write in
  for (const f of [...shapes.frames].sort((a, b) => a.y0 - b.y0)) {
    const within = inside(f)
    const ticksIn = shapes.ticks.filter((t) => centerIn(t, f))
    if (f.rows.length && f.cols.length) {
      const ys = [f.y0, ...f.rows, f.y1]
      const xs = [f.x0, ...f.cols, f.x1]
      const cell = (r: number, c: number): Rect => ({ x0: xs[c], y0: ys[r], x1: xs[c + 1], y1: ys[r + 1] })
      const textIn = (r: number, c: number) => within.filter((p) => centerIn(p, cell(r, c))).map((p) => p.text).join(' ').trim()
      const tickIn = (r: number, c: number) => ticksIn.some((t) => centerIn(t, cell(r, c)))
      const cols = xs.length - 1
      const rowCount = ys.length - 1
      const head = Array.from({ length: rowCount }, (_, r) => r).find((r) => Array.from({ length: cols }, (_, c) => textIn(r, c)).filter(Boolean).length >= Math.ceil(cols / 2)) ?? 0
      const headers = Array.from({ length: cols }, (_, c) => cleanLabel(textIn(head, c)) || `Column ${c + 1}`)
      const body = Array.from({ length: rowCount - head - 1 }, (_, i) => head + 1 + i)
      const empty = body.every((r) => Array.from({ length: cols }, (_, c) => !textIn(r, c) && !tickIn(r, c)).every(Boolean))
      const title = take(above(f, 2.5 * em))
      if (empty || !body.length) {
        // a heading above the table also starts its section
        if (title && headingLike(title, em)) items.push({ at: title, heading: cleanLabel(title.text) })
        add(f, title?.text ?? '', 'table', { columns: headers.map((label) => ({ key: '', label, kind: columnKind(label), options: [] })) })
      } else {
        // a list of questions: the first column says what, the other columns are answers
        if (title) items.push({ at: title, heading: cleanLabel(title.text) })
        for (const r of body) {
          const question = cleanLabel(textIn(r, 0))
          if (!question) continue
          const at = cell(r, 0)
          const choiceCols = Array.from({ length: cols - 1 }, (_, i) => i + 1).filter((c) => tickIn(r, c) || (!textIn(r, c) && CHOICE_WORDS.test(headers[c])))
          if (choiceCols.length >= 2) {
            const options = choiceCols.map((c) => headers[c])
            const yesNo = options.length === 2 && options.every((o) => /^(yes|no|हाँ|हां|नहीं)$/i.test(o))
            add(at, question, yesNo ? 'yes_no' : 'one_of', { options: yesNo ? [] : options })
          } else if (choiceCols.length === 1) add(at, question, 'checkbox')
          for (let c = 1; c < cols; c++)
            if (!choiceCols.includes(c) && !textIn(r, c) && !tickIn(r, c)) add(cell(r, c), `${question} – ${headers[c]}`, kindOf(headers[c], 'text'))
        }
      }
      for (const p of within) p.used = true
      for (const t of ticksIn) busy.add(t)
      for (const rl of shapes.rules) if (centerIn(rl, f)) busy.add(rl)
      continue
    }
    const xs = [f.x0, ...f.cols, f.x1]
    const cells = xs.slice(1).map((x, i) => x - xs[i])
    if (f.cols.length && !f.rows.length && cells.every((w) => w <= 2.2 * em) && f.y1 - f.y0 <= 2.5 * em) {
      // one box per character: PAN, Aadhaar, PIN code…
      if (within.length) continue
      const label = take(leftOf(f, false) ?? above(f, 1.5 * em))
      add(label ? box([label, f]) : f, label?.text ?? '', kindOf(label?.text ?? '', 'text'), { maxLength: cells.length })
      continue
    }
    // boxes side by side (or stacked) in one frame: each is a box of its own
    const ys = [f.y0, ...f.rows, f.y1]
    const parts = f.rows.length && !f.cols.length
      ? ys.slice(1).map((y, i): Rect => ({ x0: f.x0, y0: ys[i], x1: f.x1, y1: y }))
      : xs.slice(1).map((x, i): Rect => ({ x0: xs[i], y0: f.y0, x1: x, y1: f.y1 }))
    for (const part of parts) {
      const words = inside(part)
      // a frame around printed text is decoration, not a field
      const printed = words.reduce((s, p) => s + (p.x1 - p.x0) * (p.y1 - p.y0), 0)
      if (printed > 0.35 * (part.x1 - part.x0) * (part.y1 - part.y0) || words.length > 3) continue
      // a label printed inside the box (at its top or left), else beside or above it
      const own = words.find((p) => p.y0 - part.y0 < 0.6 * (part.y1 - part.y0) && p.x0 - part.x0 < 0.5 * (part.x1 - part.x0))
      const label = take(own ?? leftOf(part, false) ?? above(part, 1.5 * em))
      const room = part.y1 - (own ? own.y1 : part.y0)
      add(label ? box([label, part]) : part, label?.text ?? '', kindOf(label?.text ?? '', room > 2.4 * em ? 'long_text' : 'text'))
      for (const p of words) p.used = true
    }
  }

  // boxes to tick, line by line
  const tickRows: Rect[][] = []
  for (const t of shapes.ticks.filter((t) => !busy.has(t)).sort((a, b) => a.y0 - b.y0)) {
    const row = tickRows.find((r) => overlapY(r[0], t) >= 0.5 * (t.y1 - t.y0))
    if (row) row.push(t)
    else tickRows.push([t])
  }
  type Question = { label?: Phrase; ticks: Rect[]; options: string[] }
  const questions: Question[] = []
  for (const row of tickRows) {
    row.sort((a, b) => a.x0 - b.x0)
    const band: Rect = box(row)
    const lineWords = words.filter((w) => overlapY(w, band) >= 0.4 * (w.y1 - w.y0))
    const optionOf = (t: Rect, next?: Rect) => {
      // the words right after the box, up to the next box or a wide gap; else just before it
      const after = lineWords.filter((w) => w.x0 >= t.x1 - 2 && (!next || w.x1 <= next.x0 + 2)).sort((a, b) => a.x0 - b.x0)
      const run: Word[] = []
      for (const w of after) {
        if ((run.length ? w.x0 - run[run.length - 1].x1 : w.x0 - t.x1) > 1.2 * em) break
        if (run.length && /[:?]$/.test(run[run.length - 1].text)) break
        run.push(w)
      }
      if (run.length) return run
      const before = lineWords.filter((w) => w.x1 <= t.x0 + 2 && t.x0 - w.x1 <= 1.2 * em).sort((a, b) => b.x0 - a.x0)
      return before.length ? [before[0]] : []
    }
    let q: Question | undefined
    row.forEach((t, i) => {
      const opt = optionOf(t, row[i + 1])
      // words between the previous option and this box that end with ':' or '?' start a new question
      const lead = lineWords.filter((w) => w.x1 <= t.x0 + 2 && (i === 0 || w.x0 >= row[i - 1].x1) && !opt.includes(w)).sort((a, b) => a.x0 - b.x0)
      const startsNew = i === 0 || lead.some((w) => /[:?]$/.test(w.text))
      if (startsNew) {
        const label = lead.length ? phrases.find((p) => p.words.includes(lead[lead.length - 1])) : undefined
        q = { label: label && free(label) ? label : undefined, ticks: [], options: [] }
        questions.push(q)
      }
      q!.ticks.push(t)
      q!.options.push(cleanLabel(opt.map((w) => w.text).join(' ')))
      for (const p of phrases) if (p.words.some((w) => opt.includes(w))) p.used = true
    })
  }
  for (const q of questions) if (q.label) q.label.used = true
  // one box per line, stacked at the same x: a single list of choices
  const merged: Question[] = []
  for (const q of questions) {
    const prev = merged[merged.length - 1]
    if (prev && q.ticks.length === 1 && !q.label && prev.ticks.every((t) => Math.abs(t.x0 - q.ticks[0].x0) <= em) && q.ticks[0].y0 - prev.ticks[prev.ticks.length - 1].y1 <= 1.5 * em) {
      prev.ticks.push(...q.ticks)
      prev.options.push(...q.options)
    } else merged.push({ ...q, ticks: [...q.ticks], options: [...q.options] })
  }
  for (const q of merged) {
    const at = box(q.label ? [q.label, q.ticks[0]] : q.ticks)
    const opts = q.options.filter(Boolean)
    // the question may be on the line above; a single box that has its own words needs none
    const label = q.label ?? (q.ticks.length === 1 && opts.length ? undefined : take(above(at, 1.8 * em)))
    const text = label?.text ?? ''
    if (q.ticks.length === 1) {
      // one box: a statement to agree with, or a question with one box
      add(at, text ? `${text} ${opts[0] ?? ''}` : (opts[0] ?? ''), 'checkbox')
      continue
    }
    const lower = opts.map((o) => o.toLowerCase())
    if (opts.length === 2 && lower.includes('yes') && lower.includes('no')) add(at, text, 'yes_no')
    else {
      const stacked = new Set(q.ticks.map((t) => Math.round(t.x0 / em))).size === 1
      const many = stacked || /all that apply|any|select|tick|✓/i.test(text)
      add(at, text, many ? 'many_of' : 'one_of', { options: opts })
    }
  }

  // lines to write on
  const rules = shapes.rules.filter((r) => !busy.has(r) && !shapes.frames.some((f) => centerIn(r, f))).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  const done = new Set<Rect>()
  for (const r of rules) {
    if (done.has(r)) continue
    // a line right under printed words is an underline, not a place to write
    const over = phrases.find((p) => p.y1 <= r.y0 + 0.2 * em && r.y0 - p.y1 <= 0.6 * em && overlapX(p, r) >= 0.5 * (r.x1 - r.x0))
    if (over && !/[:：]$/.test(over.text)) continue
    let at: Rect = r
    let kind: Kind | undefined
    // "__/__/____": lines on one row joined by slashes are one date
    for (;;) {
      const next = rules.find((n) => !done.has(n) && n !== r && Math.abs((n.y0 + n.y1) / 2 - (at.y0 + at.y1) / 2) <= 0.4 * em && n.x0 >= at.x1 && n.x0 - at.x1 <= 1.5 * em)
      const joint = next && words.find((w) => w.x0 >= at.x1 - 2 && w.x1 <= next.x0 + 2 && /^[/\-.]+$/.test(w.text))
      if (!next || !joint) break
      done.add(next)
      at = box([at, next])
      kind = 'date'
    }
    const label = take(leftOf(at, true) ?? below(at, 1.2 * em) ?? above(at, 1.6 * em))
    // more lines straight below, with no label of their own: one longer answer
    let lines = 1
    for (const n of rules) {
      if (done.has(n) || n === r || n.y0 <= at.y1 || n.y0 - at.y1 > 2.5 * em) continue
      if (Math.abs(n.x0 - at.x0) > 1.5 * em && !(label && Math.abs(n.x0 - label.x0) <= 1.5 * em)) continue
      if (leftOf(n, true)) break
      done.add(n)
      at = box([at, n])
      lines++
    }
    done.add(r)
    const text = label?.text ?? ''
    add(label ? box([label, r]) : at, text, kind ?? kindOf(text, lines > 1 || r.x1 - r.x0 > 30 * em ? 'long_text' : 'text'))
  }

  // headings: short lines on their own, large, numbered or in capitals
  for (const line of lines) {
    if (line.length !== 1 || line[0].used || !headingLike(line[0], em)) continue
    line[0].used = true
    items.push({ at: line[0], heading: cleanLabel(line[0].text) })
  }

  // "Label:" with room to write after it, but no line drawn
  for (const p of phrases) {
    if (p.used || !/[:：]$/.test(p.text) || p.text.length > 60) continue
    const right: Rect = { x0: p.x1, y0: p.y0, x1: p.x1 + 5 * em, y1: p.y1 }
    if (right.x1 > shapes.width || phrases.some((q) => q !== p && overlapX(q, right) > 0 && overlapY(q, right) > 0)) continue
    const next = phrases.find((q) => q.y0 >= p.y1 && q.y0 - p.y1 <= 1.5 * em && Math.abs(q.x0 - p.x0) <= em && q.words.length >= 6)
    if (next) continue // an introduction to the paragraph below
    p.used = true
    add({ ...p, x1: right.x1 }, p.text, kindOf(p.text, 'text'))
  }

  // reading order: top to bottom, and left to right on a line
  return items.sort((a, b) => {
    const ay = (a.at.y0 + a.at.y1) / 2
    const by = (b.at.y0 + b.at.y1) / 2
    return Math.abs(ay - by) <= 0.6 * em ? a.at.x0 - b.at.x0 : ay - by
  })
}

/** Pages of items into a form outline: headings start sections, the first big heading on page one is the title. */
export function toSketch(pages: Item[][]): Sketch {
  const sketch: Sketch = { title: '', sections: [{ title: '', fields: [] }] }
  pages.forEach((items, page) => {
    items.forEach((it, i) => {
      if ('heading' in it) {
        if (page === 0 && !sketch.title && i === 0 && sketch.sections[0].fields.length === 0) sketch.title = it.heading
        else sketch.sections.push({ title: it.heading, fields: [] })
      } else sketch.sections[sketch.sections.length - 1].fields.push(it.field)
    })
  })
  sketch.sections = sketch.sections.filter((s) => s.fields.length)
  return sketch
}
