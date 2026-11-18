// Rich text keeps only plain formatting: what a pasted page or a tampered value brings in beyond that is dropped.

const KEEP = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'H3', 'H4', 'BLOCKQUOTE', 'SPAN'])
/** The one style kept: a span's text colour, as #rgb, #rrggbb or rgb(r, g, b). */
const COLOUR = /^\s*color:\s*(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3}\s*\))\s*;?\s*$/i
/** Dropped with everything in them. Any other tag is unwrapped: its text stays. */
const DROP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'NOSCRIPT', 'TEXTAREA', 'SELECT', 'HEAD', 'TITLE'])

/**
 * Keeps only bold, italic, underline, strike, text colour, lists, links (http, https, mailto), h3/h4 headings, quotes and paragraphs.
 * Needs a DOM (the browser). Run a sanitizer such as DOMPurify on your server as well: a client can send anything.
 */
export function cleanHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html')
  const clean = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue // text
      if (child.nodeType !== 1) { child.remove(); continue } // comments and the like
      let el = child as Element
      if (DROP.has(el.tagName)) { el.remove(); continue }
      // <font color> (older browsers' colour) becomes a span with that colour
      if (el.tagName === 'FONT' && /^#[0-9a-f]{3,6}$/i.test(el.getAttribute('color') ?? '')) {
        const span = el.ownerDocument.createElement('span')
        span.setAttribute('style', `color: ${el.getAttribute('color')}`)
        span.append(...el.childNodes)
        el.replaceWith(span)
        el = span
      }
      clean(el)
      // a span is kept only for its colour
      if (el.tagName === 'SPAN' && !COLOUR.test(el.getAttribute('style') ?? '')) { el.replaceWith(...el.childNodes); continue }
      if (!KEEP.has(el.tagName)) { el.replaceWith(...el.childNodes); continue }
      for (const a of [...el.attributes]) {
        const link = el.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value.trim())
        const colour = el.tagName === 'SPAN' && a.name === 'style'
        if (!link && !colour) el.removeAttribute(a.name)
      }
      if (el.tagName === 'A') el.setAttribute('rel', 'noopener noreferrer')
    }
  }
  clean(doc.body)
  return doc.body.innerHTML
}
