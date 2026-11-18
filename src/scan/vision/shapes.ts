// Finds what is drawn on a page: lines to write on, boxes to tick, and frames with their rows and columns.
import { binarize, components, dilate, rect, typicalHeight } from './pixels.ts'
import type { Chain, Comp, Frame, Gray, Own, Rect, Shapes } from './types.ts'
import { centerIn } from './words.ts'

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

/** Share of positions along each side that have ink within `t` pixels of the edge: [top, bottom, left, right]. */
export function sides(c: Rect, own: Own, t: number): number[] {
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
export function isTick(c: Comp, own: Own, em: number): boolean {
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
export function touching(c: Rect, ink: Uint8Array, w: number, em: number): boolean {
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
export function asFrame(c: Comp, own: Own, em: number): Frame | null {
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
export function splitBands(f: Frame, own: Own, em: number): Frame[] {
  if (!f.rows.length) return [f]
  const t = Math.max(2, Math.round(0.15 * em))
  const ys = [f.y0, ...f.rows, f.y1]
  const colsOf = (ya: number, yb: number) => {
    const found: number[] = []
    let run: number[] = []
    const flush = () => {
      if (run.length) found.push(Math.round((run[0] + run[run.length - 1]) / 2))
      run = []
    }
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

/** Thin pieces at about the same height with short gaps between them make one line. */
export function chains(pieces: Comp[], em: number): Chain[] {
  const tol = Math.max(2, 0.25 * em)
  const gap = 0.6 * em
  const open: Chain[] = []
  const done: Chain[] = []
  for (const p of [...pieces].sort((a, b) => a.x0 - b.x0)) {
    for (let i = open.length - 1; i >= 0; i--) if (open[i].x1 + gap < p.x0) done.push(...open.splice(i, 1))
    const yc = (p.y0 + p.y1) / 2
    let best: Chain | undefined
    for (const ch of open) if (Math.abs(ch.yc - yc) <= tol && p.x0 >= ch.x1 - 2 && (!best || Math.abs(ch.yc - yc) < Math.abs(best.yc - yc))) best = ch
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
