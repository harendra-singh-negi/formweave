// The layout pieces the palette adds, and the settings panel of each.
import { text } from '../../core/form.ts'
import type { Field, FormSchema, Grid, Layout, Values } from '../../core/schema.ts'
import type { Container } from '../layout-edits.ts'
import { cssClasses, formula } from './field-settings.ts'

export const NODES: [string, string, () => Layout][] = [
  ['section', 'Section', () => ({ type: 'section', title: 'Section', children: [] })],
  ['grid', 'Grid (columns)', () => ({ type: 'grid', cols: 2, children: [] })],
  ['pages', 'Steps / tabs', () => ({ type: 'pages', display: 'steps', children: [{ type: 'section', title: 'Step 1', children: [] }] })],
  ['heading', 'Heading', () => ({ type: 'content', as: 'heading', text: 'Heading' })],
  ['text', 'Text', () => ({ type: 'content', as: 'text', text: 'Some text' })],
  ['rich', 'Rich text', () => ({ type: 'content', as: 'rich', text: '<p><strong>Please note:</strong> write in capital letters.</p>' })],
  ['divider', 'Divider', () => ({ type: 'content', as: 'divider' })],
  ['image', 'Image', () => ({ type: 'content', as: 'image' })],
  ['imageText', 'Image beside text', () => ({ type: 'grid', cols: { base: 1, md: 2 }, widths: [1, 4], look: 'lines', children: [
    { type: 'content', as: 'image' },
    { type: 'content', as: 'rich', text: '<p>Text beside the picture. <strong>Bold</strong>, <span style="color: #1a7f37">colours</span> and lists work here.</p>' },
  ] })],
  ['labelRows', 'Label | text rows', () => ({ type: 'grid', cols: { base: 1, md: 2 }, widths: [1, 4], look: 'lines', children: [
    { type: 'content', as: 'heading', text: 'Objective' }, { type: 'content', as: 'rich', text: '<p>What this part is for.</p>' },
    { type: 'content', as: 'heading', text: 'Tagged rank' }, { type: 'content', as: 'rich', text: '<p>Who it is for.</p>' },
  ] })],
]

export const showWhen = formula('Show only when', "employment == 'Self Employed'")
export const cols = (label: string): Field => ({ type: 'number', label, min: 1, max: 12, decimals: 0 })
export const NODE_SETTINGS: Record<string, FormSchema> = {
  section: { version: 1, fields: {
    title: { type: 'string', label: 'Title' },
    look: { type: 'choice', widget: 'buttons', label: 'Style', required: true, options: [{ value: 'plain', label: 'Plain' }, { value: 'box', label: 'Box' }, { value: 'band', label: 'Title band' }, { value: 'line', label: 'Underlined' }] },
    visible: showWhen, className: cssClasses,
  } },
  grid: { version: 1, fields: {
    base: cols('Columns on phones'), sm: cols('Columns from 480px'), md: cols('Columns from 640px'), lg: cols('Columns from 960px'),
    widths: { type: 'string', label: 'Column widths', placeholder: '1 3', pattern: '\\s*\\d+(\\.\\d+)?(\\s+\\d+(\\.\\d+)?)*\\s*', messages: { pattern: 'Numbers with spaces between, like 1 3' },
      help: 'How wide each column is next to the others: "1 3" makes the second three times the first. Empty: all the same.' },
    lines: { type: 'boolean', widget: 'toggle', label: 'Lines between cells', help: 'Drawn like a table: a label cell beside a text cell, a picture beside its words.' },
    visible: showWhen, className: cssClasses,
  }, layout: [{ type: 'grid', cols: 2, children: ['base', 'sm', 'md', 'lg'] }, 'widths', 'lines', 'visible', 'className'] },
  pages: { version: 1, fields: {
    display: { type: 'choice', label: 'Shown as', options: ['steps', 'tabs', 'accordion'], required: true },
    position: { type: 'choice', widget: 'radio', label: 'Where the steps go', options: ['top', 'left', 'right', 'bottom'], required: true, visible: "display != 'accordion'",
      help: 'Left and right show at the top when the form is narrow, like on a phone.' },
    visible: showWhen,
    className: cssClasses,
  } },
  content: { version: 1, fields: {
    as: { type: 'choice', label: 'Kind', options: [{ value: 'heading', label: 'Heading' }, { value: 'text', label: 'Text' }, { value: 'rich', label: 'Rich text (bold, colours, lists, links)' }, { value: 'image', label: 'Image' }, { value: 'divider', label: 'Divider' }], required: true },
    src: { type: 'string', widget: 'image', label: 'Picture', visible: "as == 'image'" },
    alt: { type: 'string', label: 'What it shows', help: 'Read out to people who can\'t see it. Empty for a decoration.', visible: "as == 'image'" },
    width: { type: 'number', label: 'Largest width (px)', min: 8, max: 4000, decimals: 0, placeholder: 'Its column', visible: "as == 'image'" },
    text: { type: 'string', widget: 'textarea', label: 'Text', visible: "as == 'heading' or as == 'text'" },
    html: { type: 'string', widget: 'richtext', label: 'Text', visible: "as == 'rich'" },
    visible: showWhen, className: cssClasses,
  } },
}

export function nodeSettings(n: Container | Extract<Layout, { type: 'content' }>): Values {
  return { ...nodeOwn(n), className: n.className ?? null }
}
export function nodeOwn(n: Container | Extract<Layout, { type: 'content' }>): Values {
  const visible = typeof n.visible === 'string' ? n.visible : null
  switch (n.type) {
    case 'section': return { title: text(n.title, 'en') || null, look: n.look ?? 'plain', visible }
    case 'grid': {
      const c = typeof n.cols === 'number' ? { base: 1, md: n.cols } : (n.cols ?? {})
      return { base: c.base ?? null, sm: c.sm ?? null, md: c.md ?? null, lg: c.lg ?? null, widths: n.widths?.join(' ') ?? null, lines: n.look === 'lines', visible }
    }
    case 'pages': return { display: n.display ?? 'steps', position: n.position ?? 'top', visible }
    case 'content': return { as: n.as ?? 'text', text: n.as === 'rich' ? null : text(n.text, 'en') || null, html: n.as === 'rich' ? text(n.text, 'en') || null : null,
      src: n.src ?? null, alt: text(n.alt, 'en') || null, width: n.width ?? null, visible }
  }
}

export function fromNodeSettings(n: Exclude<Layout, string>, s: Values): Layout {
  const out: Record<string, unknown> = { ...n }
  const put = (k: string, v: unknown) => (v === null || v === undefined || v === '' ? delete out[k] : (out[k] = v))
  const words = (old: unknown, v: unknown) => (v && old && typeof old === 'object' ? { ...old, en: v } : v)
  put('visible', s.visible)
  put('className', s.className)
  if (n.type === 'section') { put('title', words(n.title, s.title)); put('look', s.look === 'plain' ? null : s.look) }
  if (n.type === 'pages') { put('display', s.display); put('position', s.position === 'top' ? null : s.position) }
  if (n.type === 'content') {
    put('as', s.as)
    // rich text is typed in its own box; switching kinds keeps the words (without formatting when leaving rich)
    const plain = (html: unknown) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null
    const typed = s.as === 'rich' ? (s.html ?? (n.as === 'rich' ? null : s.text)) : (s.text ?? (n.as === 'rich' ? plain(s.html) : null))
    put('text', s.as === 'divider' || s.as === 'image' ? null : words(n.text, typed))
    put('src', s.as === 'image' ? s.src : null)
    put('alt', s.as === 'image' ? words(n.alt, s.alt) : null)
    put('width', s.as === 'image' ? s.width : null)
  }
  if (n.type === 'grid') {
    const c = Object.fromEntries(['base', 'sm', 'md', 'lg'].filter((k) => typeof s[k] === 'number').map((k) => [k, s[k]]))
    put('cols', Object.keys(c).length ? (c as Grid['cols']) : null)
    const widths = String(s.widths ?? '').trim().split(/\s+/).map(Number).filter((w) => w > 0)
    put('widths', widths.length ? widths : null)
    put('look', s.lines ? 'lines' : null)
  }
  return out as unknown as Layout
}
