// Pixel work on a grey page: black and white, connected blobs, wiping and thickening.
import type { Comp, Gray, Rect, Shapes } from './types.ts'

/** The page with the shapes painted white, so OCR sees only the printed words. */
export function erase(g: Gray, shapes: Shapes): Gray {
  const data = g.data.slice()
  for (let i = 0; i < data.length; i++) if (shapes.mask[i]) data[i] = 255
  return { data, width: g.width, height: g.height }
}

/** Ink where a pixel is darker than its neighbourhood: copes with shadows and uneven light in photos. */
export function binarize({ data, width: w, height: h }: Gray): Uint8Array {
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

export function components(ink: Uint8Array, w: number, h: number): { lab: Int32Array; comps: Comp[] } {
  const lab = new Int32Array(w * h)
  const stack = new Int32Array(w * h)
  const comps: Comp[] = []
  for (let i = 0; i < w * h; i++) {
    if (!ink[i] || lab[i]) continue
    const id = comps.length + 1
    let top = 0
    stack[top++] = i
    lab[i] = id
    let x0 = w,
      y0 = h,
      x1 = 0,
      y1 = 0,
      n = 0
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
export function typicalHeight(comps: Comp[], pageHeight: number): number {
  const hs = comps.filter((c) => c.y1 - c.y0 >= 4 && c.y1 - c.y0 <= pageHeight / 15 && c.x1 - c.x0 <= 3 * (c.y1 - c.y0) && c.n >= 8).map((c) => c.y1 - c.y0)
  return hs.length ? Math.min(300, Math.max(8, Math.round(1.7 * median(hs)))) : 20
}

export function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
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

export const rect = (r: Rect): Rect => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 })
export const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1]
}

// ---- reading the page ----
