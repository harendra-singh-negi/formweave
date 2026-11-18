// The questions of every page put together into one outline of the form.
import type { Item, Sketch, SketchField } from './types.ts'

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
