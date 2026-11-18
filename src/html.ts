// Rich text keeps only plain formatting: what a pasted page or a tampered value brings in beyond that is dropped.

const KEEP = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'H3', 'H4', 'BLOCKQUOTE'])
/** Dropped with everything in them. Any other tag is unwrapped: its text stays. */
const DROP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'NOSCRIPT', 'TEXTAREA', 'SELECT', 'HEAD', 'TITLE'])

/**
 * Keeps only bold, italic, underline, strike, lists, links (http, https, mailto), h3/h4 headings, quotes and paragraphs.
 * Needs a DOM (the browser). Run a sanitizer such as DOMPurify on your server as well: a client can send anything.
 */
export function cleanHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html')
  const clean = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue // text
      if (child.nodeType !== 1) { child.remove(); continue } // comments and the like
      const el = child as Element
      if (DROP.has(el.tagName)) { el.remove(); continue }
      clean(el)
      if (!KEEP.has(el.tagName)) { el.replaceWith(...el.childNodes); continue }
      for (const a of [...el.attributes]) {
        const link = el.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value.trim())
        if (!link) el.removeAttribute(a.name)
      }
      if (el.tagName === 'A') el.setAttribute('rel', 'noopener noreferrer')
    }
  }
  clean(doc.body)
  return doc.body.innerHTML
}
