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
  /** Another part of the same drawn frame follows right below: this part's words may be its title. */
  next?: boolean
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
export type ColumnKind = 'text' | 'long_text' | 'number' | 'money' | 'date' | 'yes_no' | 'one_of' | 'checkbox'
export interface SketchColumn {
  key: string
  label: string
  kind: ColumnKind
  options: string[]
  /** The whole printed heading, when the label is cut short */
  full?: string
  /** Choices to pick from, but typed answers are fine too (some rows ask for a value, some for Yes/No) */
  free?: boolean
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
  /** For a table: fixed rows, one per text (what the first column of a question table said). */
  rows?: string[]
  /** For a table: rows shown at the start. */
  minRows?: number
  /** For fixed rows: the heading over their column. */
  rowHeading?: string
  /** Fields with the same number were printed side by side on one line. */
  line?: number
}
/** A form's outline: what scanning finds, before it becomes a formweave schema. */
export interface Sketch {
  title: string
  sections: { title: string; fields: SketchField[] }[]
  /** Lines or boxes left out because nothing printed said what they are for. */
  skipped?: number
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
  const parts: Frame[][] = [] // frames split into bands, by the drawn frame they came from
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
      const bands = splitBands(frame, own(c), em)
      if (bands.length > 1) parts.push(bands)
      frames.push(...bands)
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
  // bands next to each other that both hold boxes to tick are one grid of boxes, however its columns are drawn
  for (const bands of parts) {
    const boxes = (f: Frame) => ticks.some((t) => centerIn(t, f))
    for (let i = bands.length - 1; i > 0; i--) {
      const [a, b] = [bands[i - 1], bands[i]]
      if (!boxes(a) || !boxes(b)) continue
      const merged: Frame = { x0: a.x0, x1: a.x1, y0: a.y0, y1: b.y1, cols: [], rows: [...a.rows, a.y1, ...b.rows], next: b.next }
      frames.splice(frames.indexOf(a), 1, merged)
      frames.splice(frames.indexOf(b), 1)
      bands.splice(i - 1, 2, merged)
    }
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

/**
 * A frame whose column lines stop at some rows (a title row across the top, "Label | value" rows, then a table)
 * becomes one frame per run of rows that share their column lines.
 */
function splitBands(f: Frame, own: Own, em: number): Frame[] {
  if (!f.rows.length) return [f]
  const t = Math.max(2, Math.round(0.15 * em))
  const ys = [f.y0, ...f.rows, f.y1]
  const colsOf = (ya: number, yb: number) => {
    const found: number[] = []
    let run: number[] = []
    const flush = () => { if (run.length) found.push(Math.round((run[0] + run[run.length - 1]) / 2)); run = [] }
    const len = yb - ya - 4 * t
    if (len <= 0) return found
    for (let x = f.x0 + 2 * t; x < f.x1 - 2 * t; x++) {
      let k = 0
      for (let y = ya + 2 * t; y < yb - 2 * t; y++) if (own(x, y)) k++
      if (k >= 0.85 * len) run.push(x)
      else flush()
    }
    flush()
    return found
  }
  const bands = ys.slice(1).map((y, i) => ({ y0: ys[i], y1: y, cols: colsOf(ys[i], y) }))
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= t + 2)
  if (bands.every((b) => same(b.cols, bands[0].cols))) return [f]
  const out: Frame[] = []
  for (const b of bands) {
    const last = out[out.length - 1]
    if (last && same(last.cols, b.cols)) {
      last.rows.push(last.y1)
      last.y1 = b.y1
    } else out.push({ x0: f.x0, x1: f.x1, y0: b.y0, y1: b.y1, cols: b.cols, rows: [] })
  }
  for (const part of out.slice(0, -1)) part.next = true
  return out
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
  return k === 'number' || k === 'money' || k === 'date' || k === 'long_text' ? k : 'text'
}
const SCALE_WORDS = /\b(?:below|above|average|poor|fair|good|very good|excellent|satisfactory|unsatisfactory|low|medium|high|never|rarely|sometimes|often|always|agree|disagree|neutral)\b/i
const NUMBERING = /^(?:s\.?\s*no\.?|sr\.?\s*no\.?|no\.?|#|sl\.?\s*no\.?|क्र\.?\s*सं\.?)$/i
const CHOICE_WORDS = /^(yes|no|n\/?a|ok|not ok|done|pass|fail|true|false|हाँ|हां|नहीं|✓|✔|x)$/i

/** A long printed heading cut to its first part: "OPEN ITEMS, MEMORANDA (Where Class records…)" → "OPEN ITEMS, MEMORANDA". */
function shortLabel(s: string): string {
  if (s.length <= 60) return s
  const cut = s.split(/\s[(–-]\s?|\.\s/)[0]
  return (cut.length <= 80 ? cut : cut.slice(0, 80).replace(/\s\S*$/, '')).trim()
}

/** "1. Full name*:" → "Full name" */
export function cleanLabel(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[1l|] (?=[a-z])/, 'I ') // OCR reads a capital I as 1 or l
    .replace(/^\(?(?:\d{1,2}|[a-hA-H]|[ivxIVX]{1,4})[.)]\s+/, '')
    .replace(/\*/g, '')
    .replace(/(\p{L}{2,})[:：]\s+(?=\S)/u, '$1 – ') // "LAST PSC INSPECTION: Place" → "LAST PSC INSPECTION – Place"
    .replace(/[^\p{L}\p{M}\p{N})\]?]+$/u, '') // trailing colons, dots, quotes and OCR's stray marks (®, ’)
    .replace(/^(.*\([^)]*)$/, '$1)') // "Amount (Rs.):" loses its ")" with the colon
    .trim()
}

function headingLike(p: Phrase, em: number): boolean {
  if (/^[•·▪◦‣∙●○■➢►✓-]/.test(p.text) || /\.$/.test(p.text)) return false // a point of a list, or a sentence
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
function phrasesOf(words: Word[], em: number, walls: Rect[] = []): Phrase[][] {
  const split = (a: Word, b: Word) => walls.some((v) => v.x0 >= a.x1 - 2 && v.x0 <= b.x0 + 2 && v.y0 <= Math.min(a.y0, b.y0) && v.y1 >= Math.max(a.y1, b.y1))
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
        if (cur.length && (w.x0 - cur[cur.length - 1].x1 > 1.2 * em || split(cur[cur.length - 1], w))) flush()
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
  // a colon set apart from its word ("INSPECTION :") still ends it
  const colon = (w: Word) => /^[:：]$/.test(w.text.trim())
  const joined: Word[] = ocrWords.filter((w) => !colon(w)).map((w) => ({ ...w }))
  for (const c of ocrWords.filter(colon)) {
    const host = joined.find((w) => overlapY(w, c) > 0 && c.x0 - w.x1 >= -2 && c.x0 - w.x1 <= 0.5 * (c.y1 - c.y0))
    if (host) Object.assign(host, { x1: c.x1, text: host.text + ':' })
  }
  // bullets of a list: their lines are points, not headings
  const bullets = joined.filter((w) => /^[•·▪◦‣∙●○■➢►\uF0B7\uF0A7\uF076\uF0D8\uF0FC]$/u.test(w.text.trim()))
  const words = joined
    // OCR is sometimes unsure of a perfectly good word ("Address:" right before an erased dotted line); keep those
    .filter((w) => w.confidence >= 35 || /^\p{L}[\p{L}\p{M}'’.-]{2,}[:：.-]?$/u.test(w.text.trim()))
    .map((w) => ({ ...w, text: w.text.replace(/^[|_\s]+|[|_\s]+$/g, '') }))
    .filter((w) => /[\p{L}\p{N}₹$€£?*/]/u.test(w.text))
  const em = shapes.em
  // the vertical lines of frames: the sides and the column lines
  const walls = shapes.frames.flatMap((f) => [f.x0, ...f.cols, f.x1].map((x) => ({ x0: x, y0: f.y0, x1: x + 1, y1: f.y1 })))
  const lines = phrasesOf(words, em, walls)
  const phrases = lines.flat()
  const items: Item[] = []
  const add = (at: Rect, label: string, kind: Kind, extra: Partial<SketchField> = {}) => {
    const clean = cleanLabel(label)
    // a block of printed text is not a label: keep its start, the rest is help
    const short = clean.length > 120 ? shortLabel(clean) : clean
    if (short !== clean && !extra.help) extra = { ...extra, help: clean }
    items.push({ at, field: { key: '', label: short, kind, required: label.includes('*'), help: '', options: [], columns: [], ...extra } })
  }
  const free = (p: Phrase) => !p.used
  /** Unused phrase ending just left of `r`, on its line. */
  const leftOf = (r: Rect, thin: boolean) =>
    phrases
      .filter((p) => free(p) && p.x1 <= r.x0 + 0.3 * em && r.x0 - p.x1 <= (/[:：]$/.test(p.text) ? 8 : 4) * em)
      .filter((p) => (thin ? (r.y0 + r.y1) / 2 >= p.y0 - 0.2 * em && (r.y0 + r.y1) / 2 <= p.y1 + 1.0 * em : overlapY(p, r) >= 0.4 * Math.min(p.y1 - p.y0, r.y1 - r.y0)))
      .sort((a, b) => b.x1 - a.x1)[0]
  const above = (r: Rect, gap: number) =>
    phrases
      .filter((p) => free(p) && p.y1 <= r.y0 + 0.2 * em && r.y0 - p.y1 <= gap && (overlapX(p, r) > 0 || Math.abs(p.x0 - r.x0) <= 2 * em))
      .sort((a, b) => b.y1 - a.y1)[0]
  const below = (r: Rect, gap: number) =>
    phrases
      .filter((p) => free(p) && p.words.length <= 6 && p.y0 >= r.y1 - 0.2 * em && p.y0 - r.y1 <= gap && overlapX(p, r) >= 0.3 * (p.x1 - p.x0))
      .sort((a, b) => a.y0 - b.y0)[0]
  const take = (p: Phrase | undefined) => {
    if (p) p.used = true
    return p
  }
  const inside = (r: Rect) => phrases.filter((p) => centerIn(p, r))
  const busy = new Set<Rect>() // rules and ticks already accounted for
  /** The title in the band of frame right above `f` (its first line; the lines under it are a note), else a phrase just above. */
  const titleOf = (f: Rect, plain = (p: Phrase) => !!p): (Phrase & { help: string }) | undefined => {
    const band = shapes.frames.find((g) => g.next && Math.abs(g.y1 - f.y0) <= 3 && Math.abs(g.x0 - f.x0) <= em)
    const ws = band ? inside(band).filter(free) : []
    if (ws.length) {
      const top = ws.filter((p) => overlapY(p, ws[0]) > 0)
      for (const p of ws) p.used = true
      return { ...box(top), text: top.map((p) => p.text).join(' '), words: top.flatMap((p) => p.words), used: true, help: ws.filter((p) => !top.includes(p)).map((p) => p.text).join(' ') }
    }
    const p = above(f, 2.5 * em)
    // words in another frame belong to it (an option, a cell), not to this one
    return p && plain(p) && !shapes.frames.some((g) => g !== band && centerIn(p, g)) ? { ...take(p)!, help: '' } : undefined
  }
  /** The band of the same frame right above `f`, when it holds the column headings of the table `f` starts. */
  const headBand = (f: Frame) => shapes.frames.find((g) => g.next && Math.abs(g.y1 - f.y0) <= 3 && Math.abs(g.x0 - f.x0) <= em && g.cols.length >= 1 && !g.rows.length)

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
      // "Label | ______" on every row, no heading row: a field per row
      if (cols === 2 && !ticksIn.length && Array.from({ length: rowCount }, (_, r) => textIn(r, 0) && textIn(r, 0).length <= 100 && !textIn(r, 1)).every(Boolean)) {
        const names = Array.from({ length: rowCount }, (_, r) => cleanLabel(textIn(r, 0)))
        const title = titleOf(f)
        if (rowCount >= 2 && names.every((n, i) => n === String(i + 1))) {
          // "1. ___  2. ___  3. ___": as many entries as people need
          add(f, title?.text ?? '', 'table', { columns: [{ key: '', label: 'Details', kind: 'text', options: [] }], minRows: rowCount, help: title?.help ?? '' })
          for (const p of within) p.used = true
          continue
        }
        if (title) items.push({ at: title, heading: cleanLabel(title.text) })
        for (let r = 0; r < rowCount; r++) {
          const text = textIn(r, 0)
          add(box([cell(r, 0), cell(r, 1)]), text, kindOf(text, ys[r + 1] - ys[r] > 2.4 * em ? 'long_text' : 'text'))
        }
        for (const p of within) p.used = true
        continue
      }
      // the headings: the first row with words in most cells, or (rows numbered from the top) the band above
      const numberedTop = /^\d{1,2}\.?$/.test(textIn(0, 0)) && !textIn(0, 1)
      const hb = numberedTop ? headBand(f) : undefined
      // headings come before the first numbered row, if there is one
      const firstNumbered = Array.from({ length: rowCount }, (_, r) => r).find((r) => /^\d{1,3}\.?$/.test(textIn(r, 0))) ?? rowCount
      let head = Array.from({ length: firstNumbered }, (_, r) => r).find((r) => Array.from({ length: cols }, (_, c) => textIn(r, c)).filter(Boolean).length >= Math.ceil(cols / 2)) ?? (firstNumbered === 0 ? -1 : 0)
      if (head < 0) head = -1
      let headers = Array.from({ length: cols }, (_, c) => (head >= 0 ? shortLabel(cleanLabel(textIn(head, c))) : '') || `Column ${c + 1}`)
      if (hb) {
        const gx = [hb.x0, ...hb.cols, hb.x1]
        const owner = gx.slice(1).map((x1, k) => {
          // each heading cell names the column it covers most
          const span = (c: number) => Math.max(0, Math.min(x1, xs[c + 1]) - Math.max(gx[k], xs[c]))
          return Array.from({ length: cols }, (_, c) => c).sort((a, b) => span(b) - span(a))[0]
        })
        headers = Array.from({ length: cols }, (_, c) => {
          const k = owner.indexOf(c)
          const ps = k < 0 ? [] : inside({ x0: gx[k], y0: hb.y0, x1: gx[k + 1], y1: hb.y1 })
          for (const p of ps) p.used = true
          return shortLabel(cleanLabel(ps.map((p) => p.text).join(' '))) || (c === 0 ? 'No.' : `Column ${c + 1}`)
        })
        head = -1
      }
      const body = Array.from({ length: rowCount - head - 1 }, (_, i) => head + 1 + i)
      const empty = body.every((r) => Array.from({ length: cols }, (_, c) => !textIn(r, c) && !tickIn(r, c)).every(Boolean))
      const cellsAll = Array.from({ length: rowCount }, (_, r) => Array.from({ length: cols }, (_, c) => [r, c])).flat()
      const boxed = cellsAll.filter(([r, c]) => tickIn(r, c) && textIn(r, c))
      if (boxed.length >= 3 && boxed.length >= 0.6 * cellsAll.filter(([r, c]) => textIn(r, c)).length) {
        // a grid of boxes with their words ("☐ Loading  ☐ Discharging…"): one question, its title in a row of its own or above
        const titleRow = Array.from({ length: rowCount }, (_, r) => r).find((r) => !Array.from({ length: cols }, (_, c) => tickIn(r, c)).some(Boolean) && textIn(r, 0))
        const title = titleRow !== undefined ? within.filter((p) => p.y0 >= ys[titleRow] - 2 && p.y1 <= ys[titleRow + 1] + 2).map((p) => p.text).join(' ') : (take(above(f, 2.5 * em))?.text ?? '')
        add(f, title, 'many_of', { options: boxed.map(([r, c]) => cleanLabel(textIn(r, c))) })
        for (const p of within) p.used = true
        for (const t of ticksIn) busy.add(t)
        continue
      }
      const hasLine = (p: Phrase) => shapes.rules.some((r) => !centerIn(r, f) && r.x0 >= p.x1 - 0.3 * em && r.x0 - p.x1 <= 6 * em && (r.y0 + r.y1) / 2 >= p.y0 - 0.2 * em && (r.y0 + r.y1) / 2 <= p.y1 + em)
      const title = titleOf(hb ?? f, (p) => !hasLine(p))
      if (empty || !body.length) {
        // a heading above the table also starts its section
        if (title && headingLike(title, em)) items.push({ at: title, heading: cleanLabel(title.text) })
        const rulesIn = (c: number) => shapes.rules.filter((l) => centerIn(l, { x0: xs[c], y0: ys[head + 1] ?? f.y0, x1: xs[c + 1], y1: f.y1 })).length
        const columns = headers.map((label, c) => ({ key: '', label, full: textIn(head, c), kind: (columnKind(label) === 'text' && rulesIn(c) >= 2 * Math.max(1, body.length) ? 'long_text' : columnKind(label)) as ColumnKind, options: [] }))
          .filter((c) => !NUMBERING.test(c.label)) // rows are numbered anyway
        add(f, title?.text ?? '', 'table', { columns, minRows: Math.max(1, body.length), help: title?.help ?? '' })
      } else if (body.filter((r) => textIn(r, 0)).length >= 2) {
        // a list of questions: the first column says what, the other columns are the answers. One table, a row each.
        let asked = body.filter((r) => textIn(r, 0))
        let rowNames = asked.map((r) => cleanLabel(textIn(r, 0)))
        let numbered = rowNames.every((n, i) => /^\d{1,3}$/.test(n) && +n === +rowNames[0] + i)
        // "1 | Name of the Borrower | Yes/No": the numbers count the questions in the next column (some rows may have no number)
        let from = 1
        if (numbered && cols >= 3 && asked.filter((r) => textIn(r, 1)).length >= 0.6 * asked.length) {
          asked = body.filter((r) => textIn(r, 1))
          rowNames = asked.map((r) => cleanLabel(textIn(r, 1)))
          numbered = false
          from = 2
        }
        const rulesIn = (r: number, c: number) => shapes.rules.filter((l) => centerIn(l, cell(r, c))).length
        const answerCols = Array.from({ length: cols - from }, (_, i) => i + from)
        // "Yes/No" printed in each answer cell: the choices
        const printedChoice = (c: number) => {
          const ts = asked.map((r) => textIn(r, c)).filter(Boolean)
          const all = ts.length >= 2 && ts.every((t) => /^(?:yes|no|n\/?a|na)(?:\s*\/\s*(?:yes|no|n\/?a|na))+$/i.test(t))
          return all ? [...new Map(ts.flatMap((t) => t.split('/').map((x) => x.trim())).map((o) => [o.toLowerCase(), o])).values()] : undefined
        }
        // a column printed full of words or numbers is data, not answers (a payslip, a price list)
        const filled = (c: number) => asked.filter((r) => textIn(r, c)).length >= 0.5 * asked.length && !printedChoice(c)
        const tickCols = answerCols.filter((c) => asked.some((r) => tickIn(r, c)) || (asked.every((r) => !textIn(r, c)) && CHOICE_WORDS.test(headers[c])))
        const columns: SketchColumn[] = []
        if (tickCols.length >= 2) {
          const options = tickCols.map((c) => headers[c])
          const yesNo = options.length === 2 && options.every((o) => /^(yes|no|हाँ|हां|नहीं)$/i.test(o))
          const scale = options.filter((o) => /^\d{1,2}$/.test(o)).length >= 3
          columns.push({ key: '', label: scale ? 'Rating' : 'Answer', kind: yesNo ? 'yes_no' : 'one_of', options: yesNo ? [] : options })
        } else if (tickCols.length === 1) columns.push({ key: '', label: headers[tickCols[0]], kind: 'checkbox', options: [] })
        for (const c of answerCols) {
          if (tickCols.includes(c) || filled(c)) continue
          const choices = printedChoice(c)
          if (choices) {
            // some rows printed no choices: they ask for a value, so typing is allowed too
            const free = asked.filter((r) => !textIn(r, c)).length >= 0.25 * asked.length
            const yesNo = !free && choices.length === 2 && choices.every((o) => /^(yes|no)$/i.test(o))
            columns.push({ key: '', label: headers[c].startsWith('Column ') || /\//.test(headers[c]) ? 'Answer' : headers[c], kind: yesNo ? 'yes_no' : 'one_of', options: yesNo ? [] : choices, ...(free ? { free } : {}) })
            continue
          }
          const kind = columnKind(headers[c])
          columns.push({ key: '', label: headers[c].startsWith('Column ') ? (from === 2 ? 'Answer' : headers[c]) : headers[c], kind: kind === 'text' && asked.some((r) => rulesIn(r, c) >= 2) ? 'long_text' : kind, options: [] })
        }
        if (!columns.length) {
          // nothing to fill in: a printed table
          for (const p of within) p.used = true
          for (const t of ticksIn) busy.add(t)
          continue
        }
        // a long first heading is the table's question ("Evaluation of … (scoring below)"), not a column name
        const first = head >= 0 ? cleanLabel(textIn(head, 0)) : ''
        const asks = first.length > 60
        add(f, title?.text || (asks ? shortLabel(first) : ''), 'table', numbered
          ? { columns, minRows: asked.length, help: title?.help ?? '' }
          : { columns, rows: rowNames, rowHeading: asks || headers[0].startsWith('Column ') ? '' : headers[0], help: title?.help || (asks && first !== shortLabel(first) ? first : '') })
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
    const below = shapes.frames.find((g) => Math.abs(g.y0 - f.y1) <= 3 && Math.abs(g.x0 - f.x0) <= em && g.rows.length && g.cols.length)
    if (f.next && f.cols.length && below && /^\d{1,2}\.?$/.test(inside({ ...below, y1: below.rows[0] }).map((p) => p.text).join(' ').split(' ')[0] ?? '')) continue
    if (shapes.ticks.some((t) => centerIn(t, f))) continue // a question with its box: read with the boxes
    const band = titleOf(f, () => false)
    if (band) items.push({ at: band, heading: cleanLabel(band.text) })
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
    // empty rows stacked under each other: lines for one longer answer, named by the title above
    if (f.rows.length && !f.cols.length && parts.slice(1).every((p) => !inside(p).length)) {
      // the first row may hold the title itself ("Other Comments" over empty rows)
      const own = inside(parts[0])
      const label = own.length ? undefined : titleOf(f)
      for (const p of own) p.used = true
      const text = own.length ? own.map((p) => p.text).join(' ') : (label?.text ?? '')
      add(f, text, kindOf(text, 'long_text'), { help: label?.help ?? '' })
      continue
    }
    if (f.next && !f.cols.length && !f.rows.length && inside(f).length && !shapes.ticks.some((t) => centerIn(t, f))) continue
    for (const [k, part] of parts.entries()) {
      const words = inside(part)
      const next = parts[k + 1]
      // "Date of previous inspection | ______": the words name the empty box after them
      if (words.length && f.cols.length && !f.rows.length && next && !inside(next).length) continue
      if (!words.length && k > 0 && f.cols.length && !f.rows.length) {
        const prev = inside(parts[k - 1]).filter(free)
        if (prev.length) {
          for (const p of prev) p.used = true
          const text = prev.map((p) => p.text).join(' ')
          add(box([...prev, part]), text, kindOf(text, part.y1 - part.y0 > 2.4 * em ? 'long_text' : 'text'))
          continue
        }
      }
      // a frame around printed text is decoration, not a field; a frame around a short title is a heading
      const printed = words.reduce((s, p) => s + (p.x1 - p.x0) * (p.y1 - p.y0), 0)
      if (printed > 0.35 * (part.x1 - part.x0) * (part.y1 - part.y0) || words.length > 3) {
        // a frame around a title (and maybe a note under it): the title's line is a heading
        const top = words.filter((p) => overlapY(p, words[0]) > 0)
        const text = top.map((p) => p.text).join(' ')
        const lineCount = new Set(words.map((p) => Math.round(p.y0 / em))).size
        if (parts.length === 1 && text.length <= 140 && !/[:：]$/.test(text) && (f.next || lineCount <= 2)) {
          for (const p of words) p.used = true
          items.push({ at: box(top), heading: cleanLabel(text) })
        }
        continue
      }
      // a label printed inside the box (at its top or left), else beside or above it
      const own = words.find((p) => p.y0 - part.y0 < 0.6 * (part.y1 - part.y0) && p.x0 - part.x0 < 0.5 * (part.x1 - part.x0))
      const label = take(own ?? leftOf(part, false) ?? above(part, 1.5 * em))
      const room = part.y1 - (own ? own.y1 : part.y0)
      add(label ? box([label, part]) : part, label?.text ?? '', kindOf(label?.text ?? '', room > 2.4 * em ? 'long_text' : 'text'))
      for (const p of words) p.used = true
    }
  }

  // boxes to tick, line by line
  /** The frame cell around a point's rect, if it is in a frame. */
  const cellAt = (r: Rect): Rect | undefined => {
    const f = shapes.frames.find((g) => centerIn(r, g))
    if (!f) return
    const xs = [f.x0, ...f.cols, f.x1]
    const ys = [f.y0, ...f.rows, f.y1]
    const cx = (r.x0 + r.x1) / 2
    const cy = (r.y0 + r.y1) / 2
    const c = xs.findIndex((x, i) => i < xs.length - 1 && cx >= x && cx <= xs[i + 1])
    const k = ys.findIndex((y, i) => i < ys.length - 1 && cy >= y && cy <= ys[i + 1])
    return { x0: xs[c], y0: ys[k], x1: xs[c + 1], y1: ys[k + 1] }
  }
  const tickRows: Rect[][] = []
  for (const t of shapes.ticks.filter((t) => !busy.has(t)).sort((a, b) => a.y0 - b.y0)) {
    const row = tickRows.find((r) => overlapY(r[0], t) >= 0.5 * (t.y1 - t.y0))
    if (row) row.push(t)
    else tickRows.push([t])
  }
  type Question = { label?: Phrase; ticks: Rect[]; options: string[]; grid?: boolean }
  const questions: Question[] = []
  for (const row of tickRows) {
    row.sort((a, b) => a.x0 - b.x0)
    const band: Rect = box(row)
    // the words on the box's line; a box in a frame cell reads only the words in its own cell
    const lineWords = words.filter((w) => overlapY(w, band) >= 0.4 * (w.y1 - w.y0))
    const near = (t: Rect) => {
      const c = cellAt(t)
      return c ? lineWords.filter((w) => centerIn(w, c)) : lineWords
    }
    const optionOf = (t: Rect, next?: Rect) => {
      // the words right after the box, up to the next box or a wide gap; else just before it
      const after = near(t).filter((w) => w.x0 >= t.x1 - 2 && (!next || w.x1 <= next.x0 + 2)).sort((a, b) => a.x0 - b.x0)
      const run: Word[] = []
      for (const w of after) {
        if ((run.length ? w.x0 - run[run.length - 1].x1 : w.x0 - t.x1) > 1.2 * em) break
        if (run.length && /[:?]$/.test(run[run.length - 1].text)) break
        run.push(w)
      }
      if (run.length) return run
      const before = near(t).filter((w) => w.x1 <= t.x0 + 2 && t.x0 - w.x1 <= 1.2 * em).sort((a, b) => b.x0 - a.x0)
      return before.length ? [before[0]] : []
    }
    // which side the words sit: after each box ("☐ Loading"), or before it ("Master Mariner ☐")
    const nextWord = (t: Rect, dir: 1 | -1) => Math.min(Infinity, ...near(t).map((w) => (dir > 0 ? w.x0 - t.x1 : t.x0 - w.x1)).filter((d) => d >= -2))
    const before = row.length >= 2 && row.filter((t) => nextWord(t, -1) <= 0.8 * em).length > row.filter((t) => nextWord(t, 1) <= 0.8 * em).length
    const optionBefore = (t: Rect, prev?: Rect) => {
      const run = near(t).filter((w) => w.x1 <= t.x0 + 2 && (!prev || w.x0 >= prev.x1 - 2)).sort((a, b) => a.x0 - b.x0)
      // only the words close to the box: a wide gap ends the option (a question may come first)
      const out: Word[] = []
      for (let i = run.length - 1; i >= 0; i--) {
        if ((out.length ? out[0].x0 : t.x0) - run[i].x1 > 1.2 * em) break
        out.unshift(run[i])
      }
      return out
    }
    let q: Question | undefined
    row.forEach((t, i) => {
      const opt = before ? optionBefore(t, row[i - 1]) : optionOf(t, row[i + 1])
      // words between the previous option and this box that end with ':' or '?' start a new question
      const lead = near(t).filter((w) => w.x1 <= t.x0 + 2 && (i === 0 || w.x0 >= row[i - 1].x1) && !opt.includes(w)).sort((a, b) => a.x0 - b.x0)
      const startsNew = i === 0 || lead.some((w) => /[:?]$/.test(w.text))
      if (startsNew) {
        const label = lead.length ? phrases.find((p) => p.words.includes(lead[lead.length - 1])) : undefined
        q = { label: label && free(label) ? label : undefined, ticks: [], options: [] }
        questions.push(q)
      }
      q!.ticks.push(t)
      q!.options.push(cleanLabel(opt.map((w) => w.text).join(' ')).replace(/^[/|,;:.–-]+\s*/, ''))
      for (const p of phrases) if (p.words.some((w) => opt.includes(w))) p.used = true
    })
  }
  for (const q of questions) if (q.label) q.label.used = true
  // one box per line, stacked at the same x: a single list of choices
  const merged: Question[] = []
  for (const q of questions) {
    const prev = merged[merged.length - 1]
    const near = prev && q.ticks[0].y0 - prev.ticks[prev.ticks.length - 1].y1 <= 1.5 * em
    const aligned = (a: Rect[], b: Rect[]) => b.filter((t) => a.some((s) => Math.abs(s.x0 - t.x0) <= em)).length >= Math.ceil(0.6 * Math.min(a.length, b.length))
    if (near && !q.label && q.ticks.length >= 2 && prev.ticks.length >= 2 && aligned(prev.ticks, q.ticks)) {
      prev.ticks.push(...q.ticks)
      prev.options.push(...q.options)
      prev.grid = true
    } else if (prev && q.ticks.length === 1 && !q.label && prev.ticks.every((t) => Math.abs(t.x0 - q.ticks[0].x0) <= em) && q.ticks[0].y0 - prev.ticks[prev.ticks.length - 1].y1 <= 1.5 * em) {
      prev.ticks.push(...q.ticks)
      prev.options.push(...q.options)
    } else merged.push({ ...q, ticks: [...q.ticks], options: [...q.options] })
  }
  for (const q of merged) {
    const at = box(q.label ? [q.label, q.ticks[0]] : q.ticks)
    const opts = q.options.filter(Boolean)
    // the question may be on the line above; a single box that has its own words needs none
    // no question on the line: the frame cell to the left may hold it ("Condition of the vessel… | ☐ Below ☐ Average ☐ Above")
    const home = cellAt(q.ticks[0])
    const frameX0 = shapes.frames.find((g) => centerIn(q.ticks[0], g))?.x0 ?? 0
    const leftCell = home && home.x0 > frameX0 + em && !q.label && (q.ticks.length > 1 || !opts.length)
      ? phrases.filter((p) => free(p) && p.x1 <= home.x0 + 2 && p.x0 >= frameX0 - 2 && p.y0 >= box(q.ticks).y0 - 2 * em && p.y1 <= box(q.ticks).y1 + 2 * em) : []
    if (leftCell.length) {
      for (const p of leftCell) p.used = true
      q.label = { ...box(leftCell), text: leftCell.map((p) => p.text).join(' '), words: leftCell.flatMap((p) => p.words), used: true }
    }
    const label = q.label ?? (q.ticks.length === 1 && opts.length ? undefined : take(above(at, 1.8 * em)))
    const text = label?.text ?? ''
    if (q.ticks.length === 1) {
      // one box: a statement to agree with, or a question with one box
      add(at, text ? `${text} ${opts[0] ?? ''}` : (opts[0] ?? ''), 'checkbox')
      continue
    }
    const lower = opts.map((o) => o.toLowerCase())
    if (opts.length === 2 && ((lower.includes('yes') && lower.includes('no')) || (lower.includes('y') && lower.includes('n')))) add(at, text, 'yes_no')
    else {
      const stacked = new Set(q.ticks.map((t) => Math.round(t.x0 / em))).size === 1
      // a graded scale (below average … above average, poor … excellent) takes one answer, even stacked
      const scale = opts.filter((o) => SCALE_WORDS.test(o)).length >= 2 && !/all that apply/i.test(text)
      const many = !scale && (stacked || q.grid || /all that apply|any|select|tick|✓/i.test(text))
      add(at, text, many ? 'many_of' : 'one_of', { options: opts })
    }
  }

  // lines to write on
  const rules = shapes.rules.filter((r) => !busy.has(r) && !shapes.frames.some((f) => centerIn(r, f))).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  const done = new Set<Rect>()

  // printed words between two long lines, one just above and one just below: a heading band, not places to write
  for (const r of rules) {
    if (r.x1 - r.x0 < 20 * em) continue
    const p = phrases.find((q) => q.y0 >= r.y1 - 0.2 * em && q.y0 - r.y1 <= 0.8 * em && overlapX(q, r) >= 0.8 * (q.x1 - q.x0))
    const under = p && rules.find((n) => n !== r && n.y0 >= p.y1 - 0.2 * em && n.y0 - p.y1 <= 0.8 * em && overlapX(n, r) >= 0.8 * (r.x1 - r.x0))
    if (!under) continue
    for (const n of rules) if (overlapX(n, r) >= 0.8 * (r.x1 - r.x0) && ((n.y0 >= r.y0 - 0.5 * em && n.y1 <= r.y1 + 0.5 * em) || (n.y0 >= under.y0 - 0.5 * em && n.y1 <= under.y1 + 0.5 * em))) done.add(n)
  }

  // lines in columns under printed headings (RANK  NAME  SIGNATURE  DATE): a table to fill in, a row per line
  const lineRows: Rect[][] = []
  for (const r of rules) {
    const row = lineRows.find((l) => Math.abs((l[0].y0 + l[0].y1) / 2 - (r.y0 + r.y1) / 2) <= 0.4 * em)
    if (row) row.push(r)
    else lineRows.push([r])
  }
  const sameCols = (a: Rect[], b: Rect[]) => a.length === b.length && a.every((r, i) => Math.abs(r.x0 - b[i].x0) <= em && Math.abs(r.x1 - b[i].x1) <= em)
  for (let i = 0; i < lineRows.length; i++) {
    const first = lineRows[i].sort((a, b) => a.x0 - b.x0)
    // columns side by side: a double line is not two columns
    if (first.length < 2 || first.some((r) => done.has(r)) || first.some((r, k) => k && r.x0 < first[k - 1].x1 - 2)) continue
    const grid = [first]
    for (let j = i + 1; j < lineRows.length; j++) {
      const next = lineRows[j].sort((a, b) => a.x0 - b.x0)
      if (next[0].y0 - grid[grid.length - 1][0].y1 > 3 * em || !sameCols(first, next)) break
      grid.push(next)
    }
    // headings over the columns, in the band above the first row
    const heads = first.map((r) =>
      phrases.find((p) => free(p) && p.y1 <= r.y0 && r.y0 - p.y1 <= 3 * em && overlapX(p, r) >= 0.5 * Math.min(p.x1 - p.x0, r.x1 - r.x0)
        && !phrases.some((o) => o !== p && o.y0 >= p.y1 - 2 && o.y1 <= r.y0 && overlapX(o, r) > 0)))
    if (grid.length < 2 && heads.filter(Boolean).length < first.length) continue
    // rows that each have their own label ("Place: ___ Date: ___" twice) are fields, not a table
    if (grid.filter((row) => leftOf(row[0], true)).length >= 2) continue
    if (heads.some((h) => h && (/[:：]$/.test(h.text) || h.words.length > 5))) continue
    if (heads.filter(Boolean).length < Math.ceil(first.length / 2)) continue
    const at = box(grid.flat())
    const label = take(leftOf(box([at, ...heads.filter((h): h is Phrase => !!h)]), false) ?? leftOf(first[0], true) ?? above(box(heads.filter((h): h is Phrase => !!h)), 1.6 * em))
    for (const h of heads) take(h)
    add(label ? box([label, at]) : at, label?.text ?? '', 'table', {
      columns: heads.map((h, c) => {
        const l = cleanLabel(h?.text ?? '') || `Column ${c + 1}`
        return { key: '', label: l, kind: columnKind(l), options: [] }
      }),
      minRows: grid.length,
    })
    for (const r of grid.flat()) done.add(r)
  }
  for (const r of rules) {
    if (done.has(r)) continue
    // a line right under printed words is an underline, not a place to write
    const over = phrases.find((p) => p.y1 <= r.y0 + 0.2 * em && r.y0 - p.y1 <= 0.6 * em && (overlapX(p, r) >= 0.5 * (r.x1 - r.x0) || (Math.abs(p.x0 - r.x0) <= 1.5 * em && r.x1 - r.x0 > 15 * em)))
    if (over && !/[:：]$/.test(over.text)) continue
    // words printed on top of it: a shaded band behind a heading, not a line
    if (phrases.some((p) => centerIn(p, { x0: r.x0, y0: r.y0 - 0.3 * em, x1: r.x1, y1: r.y1 + 0.3 * em }))) continue
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
    if (bullets.some((b) => overlapY(b, line[0]) > 0 && b.x1 <= line[0].x0 + 2 && line[0].x0 - b.x1 <= 2 * em)) continue
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
    // a sentence ending in ':' with a list right under it ("…the superintendent shall:  • Hold a review…")
    if (p.words.length >= 6 && phrases.some((q) => q !== p && q.y0 >= p.y1 - 2 && q.y0 - p.y1 <= 1.5 * em && overlapX(q, p) > 0)) continue
    p.used = true
    add({ ...p, x1: right.x1 }, p.text, kindOf(p.text, 'text'))
  }

  // reading order: top to bottom, and left to right on a line
  items.sort((a, b) => {
    const ay = (a.at.y0 + a.at.y1) / 2
    const by = (b.at.y0 + b.at.y1) / 2
    return Math.abs(ay - by) <= 0.6 * em ? a.at.x0 - b.at.x0 : ay - by
  })
  // fields side by side on one line share it; "LAST PSC INSPECTION: Place ___ Date ___" names both after the lead-in
  let line = 0
  let prev: Item | undefined
  for (const it of items) {
    if (!('field' in it)) { prev = undefined; continue }
    const same = prev && Math.abs((prev.at.y0 + prev.at.y1) / 2 - (it.at.y0 + it.at.y1) / 2) <= 0.6 * em
    if (!same) line++
    it.field.line = line
    const lead = same && 'field' in prev! ? /^(.+?) – /.exec(prev.field.label)?.[1] : undefined
    if (lead && it.field.label && it.field.label.split(' ').length <= 2 && it.field.kind !== 'table') {
      it.field.label = `${lead} – ${it.field.label}`
      if (it.field.kind === 'text' && kindOf(lead, 'text') === 'date') it.field.kind = 'date'
    }
    prev = it
  }
  return items
}

/** Pages of items into a form outline: headings start sections, the first big heading on page one is the title. */
export function toSketch(pages: Item[][]): Sketch {
  pages = pages.map((items) => [...items])
  for (let n = 1; n < pages.length; n++) {
    const prev = pages[n - 1]
    const first = pages[n].find((it) => 'heading' in it)
    // a table that starts at the foot of a page and is printed again, heading and all, on the next one
    const again = first && 'heading' in first ? prev.findIndex((it) => 'heading' in it && it.heading === first.heading) : -1
    if (again >= 0 && pages[n].indexOf(first!) <= 1) prev.splice(again)
    // a box for a long answer that runs on to the next page: the rest of it has no label of its own
    const head = pages[n].find((it) => 'field' in it)
    if (head && 'field' in head && head.field.kind === 'table' && pages[n].indexOf(head) <= 1) {
      const tokens = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []
      const known = new Set([head.field.label, ...head.field.columns.flatMap((c) => [c.label, c.full ?? '']), head.field.help].flatMap(tokens))
      const echo = (s: string) => tokens(s).length > 0 && tokens(s).filter((t) => known.has(t)).length >= 0.6 * tokens(s).length
      let cut = prev.length
      let matched = 0
      while (cut > 0) {
        const it = prev[cut - 1]
        const text = 'heading' in it ? it.heading : it.field.label
        if (echo(text)) matched++
        else if (!('field' in it) || (text && !/^\d+$/.test(text))) break
        cut--
      }
      if (matched >= 2) prev.splice(cut)
    }
    const top = pages[n][0]
    const last = prev[prev.length - 1]
    if (top && 'field' in top && !top.field.label && top.field.kind === 'long_text' && last && 'field' in last && last.field.kind === 'long_text') pages[n].shift()
  }
  // words printed on most pages (a running header or footer) are not part of the form
  if (pages.length >= 3) {
    const seen = new Map<string, number>()
    for (const items of pages) for (const t of new Set(items.map((it) => ('heading' in it ? it.heading : it.field.label)))) seen.set(t, (seen.get(t) ?? 0) + 1)
    pages = pages.map((items) => items.filter((it) => {
      const t = 'heading' in it ? it.heading : it.field.label
      return !t || ('field' in it && it.field.kind === 'table') || (seen.get(t) ?? 0) < Math.max(3, 0.5 * pages.length)
    }))
  }
  // a box or line with no words for it, or only a number (a page number), can't be asked about
  const nameless = (f: SketchField) => f.kind !== 'table' && !f.options.length && (!f.label || /^\d+$/.test(f.label))
  const dropped = pages.flat().filter((it) => 'field' in it && nameless(it.field)).length
  pages = pages.map((items) => items.filter((it) => !('field' in it && nameless(it.field))))
  const sketch: Sketch = { title: '', sections: [{ title: '', fields: [] }], ...(dropped ? { skipped: dropped } : {}) }
  pages.forEach((items, page) => {
    for (const it of items) if ('field' in it && it.field.line) it.field.line += 1000 * (page + 1) // lines of different pages differ
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
