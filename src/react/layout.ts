// The layout pieces: sections, grids, steps / tabs / accordion, headings, text, rich text and images.
import { createElement as h, Fragment, useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { evaluate, parse, truthy, type Node } from '../core/expr.ts'
import { cleanHtml } from './clean-html.ts'
import { text, type FormState } from '../core/form.ts'
import type { Grid, Layout, Pages, Section, Values, When } from '../core/schema.ts'
import { SAFE_IMAGE } from '../core/schema.ts'
import { cx, useCtx } from './context.ts'
import { aria, Shell } from './shell.ts'

export function Nodes({ items, ip }: { items: Layout[]; ip: number[] }) {
  return h(Fragment, null, items.map((item, i) => h(LayoutView, { key: i, item, ip: [...ip, i] })))
}

export function LayoutView({ item, ip }: { item: Layout; ip: number[] }): ReactNode {
  const c = useCtx()
  if (typeof item === 'string') return h(Shell, { path: item, field: c.schema.fields[item] })
  const hidden = !shown(item.visible, c.state, c.context)
  if (hidden && !c.design) return null
  const own = c.design ? { 'data-fw-ip': ip.join('.'), 'data-fw-hidden': hidden || undefined, draggable: true } : {}
  switch (item.type) {
    case 'content':
      if (item.as === 'rich') return h(RichBlock, { html: text(item.text, c.locale), className: item.className, own })
      if (item.as === 'image')
        return item.src && SAFE_IMAGE.test(item.src)
          ? h('figure', { className: cx('fw-content', 'fw-image', item.className), ...own },
              h('img', { src: item.src, alt: text(item.alt, c.locale), loading: 'lazy', style: item.width ? { width: item.width } : undefined }))
          : c.design ? h('div', { className: 'fw-content fw-image-empty', ...own }, 'Image: pick one in its settings') : null
      return item.as === 'divider' ? h('hr', { className: cx('fw-divider', item.className), ...own })
        : h(item.as === 'heading' ? 'h3' : 'p', { className: cx('fw-content', item.className), ...own }, text(item.text, c.locale))
    case 'section':
      return h('section', { className: cx('fw-section', item.look && `fw-look-${item.look}`, item.className), ...own }, item.title && h('h3', null, text(item.title, c.locale)), h(Nodes, { items: item.children, ip }))
    case 'grid':
      return h('div', { className: cx('fw-grid', item.widths && 'fw-grid-w', item.look === 'lines' && 'fw-grid-lines', item.className), style: gridVars(item.cols, item.widths), ...own }, h(Nodes, { items: item.children, ip }))
    case 'pages':
      return h(PagesView, { item, ip })
  }
}

/** Formatted text from the schema, cleaned first. Without a DOM (rendering on a server) its words show without formatting. */
export function RichBlock({ html, className, own }: { html: string; className?: string; own: object }) {
  const props = { className: cx('fw-content', 'fw-rich-block', className), ...own }
  return typeof DOMParser === 'undefined'
    ? h('div', props, html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
    : h('div', { ...props, dangerouslySetInnerHTML: { __html: cleanHtml(html) } })
}

/** A plain number is that many columns from medium width up, one on phones. */
export function gridVars(cols: Grid['cols'], widths?: number[]): CSSProperties {
  const c = typeof cols === 'number' ? { base: 1, md: cols } : (cols ?? {})
  return { '--fw-cols': c.base ?? 1, '--fw-cols-sm': c.sm, '--fw-cols-md': c.md, '--fw-cols-lg': c.lg,
    '--fw-widths': widths?.map((w) => `minmax(0, ${w}fr)`).join(' ') } as CSSProperties
}

export function PagesView({ item, ip }: { item: Pages; ip: number[] }) {
  const c = useCtx()
  // the canvas shows every page, so a page's place in `pages` is its place in the layout too
  const pages = c.design ? item.children : visiblePages(item, c.state, c.context)
  const i = Math.max(0, Math.min(c.page, pages.length - 1))
  const body = useRef<HTMLElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (moved.current && item.display !== 'tabs') body.current?.focus() // say where we are after Next / Back; a tab keeps its focus
    moved.current = true
  }, [i])
  const title = (s: Section, j: number) => text(s.title, c.locale) || `${j + 1}`

  const own = (k: number[]) => (c.design ? { 'data-fw-ip': k.join('.'), draggable: true } : {})
  if (item.display === 'accordion')
    return h('div', { className: cx('fw-accordion', item.className), ...own(ip) },
      pages.map((s, j) => h('details', { key: j, open: j === 0, ...own([...ip, j]) }, h('summary', null, title(s, j)), h('div', { className: 'fw-accordion-body' }, h(Nodes, { items: s.children, ip: [...ip, j] })))),
      h(SubmitButton))
  if (!pages.length) return h(SubmitButton)

  const next = () => {
    if (c.design) return c.setPage(i + 1)
    const keys = keysOf(pages[i])
    const bad = Object.keys(c.state.errors).some((p) => keys.includes(p.split('.')[0]))
    if (!bad) return c.setPage(i + 1)
    for (const k of keys) c.form.touch(k)
    setTimeout(() => body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }
  const tabs = item.display === 'tabs'
  /** A step: done ones can be gone back to, later ones are reached with Next so each step gets checked. */
  const step = (s: Section, j: number) => {
    const inner = [h('span', { key: 'n', className: 'fw-step-n', 'aria-hidden': true }, j < i ? '✓' : j + 1), h('span', { key: 't', className: 'fw-step-t' }, title(s, j)), j < i && h('span', { key: 'd', className: 'fw-sr' }, ' (done)')]
    return h('li', { key: j, 'data-state': j < i ? 'done' : j === i ? 'current' : 'next', 'aria-current': j === i ? 'step' : undefined },
      j < i || (c.design && j !== i) ? h('button', { type: 'button', className: 'fw-step', onClick: () => c.setPage(j) }, inner) : h('span', { className: 'fw-step' }, inner))
  }
  /** Arrow keys move between tabs, as in any tab list. */
  const tabKey = (e: KeyboardEvent<HTMLElement>) => {
    const d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key]
    if (!d) return
    e.preventDefault()
    const j = (i + d + pages.length) % pages.length
    const list = e.currentTarget
    c.setPage(j)
    setTimeout(() => list.querySelectorAll<HTMLElement>('[role=tab]')[j]?.focus())
  }
  return h('div', { className: cx('fw-pages', item.className), 'data-position': item.position ?? 'top', ...own(ip) },
    tabs
      ? h('div', { role: 'tablist', className: 'fw-tabs', onKeyDown: tabKey },
          pages.map((s, j) => h('button', { key: j, id: `${c.id}tab${j}`, type: 'button', role: 'tab', 'aria-selected': j === i, 'aria-controls': `${c.id}panel`, tabIndex: j === i ? 0 : -1, onClick: () => c.setPage(j) }, title(s, j))))
      : h('ol', { className: 'fw-steps' }, pages.map(step)),
    h('div', { className: 'fw-pages-body' },
      h('section', { ref: body, tabIndex: -1, className: 'fw-page', ...own([...ip, i]), ...(tabs ? { id: `${c.id}panel`, role: 'tabpanel', 'aria-labelledby': `${c.id}tab${i}` } : { 'aria-label': title(pages[i], i) }) },
        h(Nodes, { items: pages[i].children, ip: [...ip, i] })),
      tabs ? h(SubmitButton)
        : h('div', { className: 'fw-nav' },
            i > 0 && h('button', { type: 'button', className: c.classes.button, onClick: () => c.setPage(i - 1) }, c.labels.back),
            i < pages.length - 1 ? h('button', { type: 'button', className: c.classes.button, onClick: next }, c.labels.next) : h(SubmitButton))))
}

export function SubmitButton() {
  const c = useCtx()
  return h('button', { type: 'submit', className: cx('fw-submit', c.classes.submit), disabled: c.busy }, c.labels.submit)
}

export const visiblePages = (p: Pages, state: FormState, context?: Values) => p.children.filter((s) => shown(s.visible, state, context))

/** Top-level field keys placed under a layout node. */
export function keysOf(item: Layout): string[] {
  if (typeof item === 'string') return [item]
  return item.type === 'content' ? [] : item.children.flatMap(keysOf)
}

export const parsed = new Map<string, Node>()
/** A section's or content's `visible`, read against the form's values. */
export function shown(w: When | undefined, state: FormState, context?: Values): boolean {
  if (w === undefined || typeof w === 'boolean') return w !== false
  let n = parsed.get(w)
  if (!n) parsed.set(w, (n = parse(w)))
  return truthy(evaluate(n, (path) => (path[0] === 'context' ? dig(context, path.slice(1)) : dig(state.values, path))))
}

export function dig(v: unknown, path: string[]): unknown {
  if (!path.length) return v
  if (Array.isArray(v)) return v.map((x) => dig(x, path))
  return v && typeof v === 'object' && Object.hasOwn(v, path[0]) ? dig((v as Values)[path[0]], path.slice(1)) : null
}

// ---- fields ----
