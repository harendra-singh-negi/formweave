// The design canvas: the form as people will see it, at a desktop, tablet or phone width, to click, drag and retype.
import { createElement as h, useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { lint } from '../core/lint.ts'
import { text } from '../core/form.ts'
import { Form } from '../react.ts'
import type { FormSchema } from '../core/schema.ts'
import type { Ip } from './layout-edits.ts'
import { fieldAt } from './schema-edits.ts'
import type { BuilderLabels, Path } from './types.ts'

export interface CanvasProps {
  schema: FormSchema
  issues: boolean
  selected: Path | null
  node: Ip | null
  select(p: Path | null): void
  selectNode(ip: Ip | null): void
  drop(data: DataTransfer, on: { path?: Path; ip?: Ip }): void
  remove(): void
  wide: boolean
  setWide(on: boolean): void
  adding: boolean
  setAdding(on: boolean): void
  relabel(on: { path?: Path; ip?: Ip }, words: string): void
  labels: BuilderLabels
}

/** The form as people will see it. A click picks the field or section under it; dragging moves things or drops new ones in. */
/** Widths the canvas shows the form at. The form follows its own width, so a phone's width gives the phone layout. */
export const DEVICES = [['desktop', 'Desktop', 1024], ['tablet', 'Tablet', 768], ['phone', 'Phone', 375]] as const

export function Canvas(p: CanvasProps) {
  const [device, setDevice] = useState<(typeof DEVICES)[number][0]>('desktop')
  const box = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(0)
  useEffect(() => {
    if (!box.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setRoom(e.contentRect.width))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [p.issues])
  const width = DEVICES.find(([k]) => k === device)![2]
  // wider than the room there is: drawn at that width, then shrunk to fit, so it is the real layout, only smaller
  const outer = width + (device === 'desktop' ? 0 : 48) // the tablet / phone frame around it (see .fw-b-device)
  const zoom = room && room < outer ? room / outer : 1
  /** Double-click a label to type over it: a box laid exactly over the words. */
  const [typing, setTyping] = useState<{ on: { path?: Path; ip?: Ip }; words: string; style: CSSProperties } | null>(null)
  const startTyping = (t: EventTarget) => {
    const el = hit(t)
    if (!el || !box.current) return
    // the words: a field's label or legend, a column heading, a section's title, a heading or a line of text
    const words = el.matches('th:not(.fw-m-opt), .fw-content:not(.fw-rich-block)') ? el : el.querySelector(':scope > label, :scope > legend, :scope > h3')
    if (!words) return
    const on = read(el)
    const r = words.getBoundingClientRect()
    const c = box.current.getBoundingClientRect()
    const cs = getComputedStyle(words)
    setTyping({
      on,
      words: on.path ? text(fieldAt(p.schema.fields, on.path)?.label, 'en') : (words.textContent ?? '').trim(),
      style: { left: r.left - c.left + box.current.scrollLeft, top: r.top - c.top + box.current.scrollTop, width: Math.max(r.width, 120), height: r.height,
        fontSize: `${parseFloat(cs.fontSize) * zoom}px`, fontWeight: cs.fontWeight, fontFamily: cs.fontFamily },
    })
  }
  const stopTyping = (save: boolean) => {
    if (typing && save) p.relabel(typing.on, typing.words.trim())
    setTyping(null)
  }
  const over = useRef<Element | null>(null)
  const mark = (el: Element | null) => {
    over.current?.classList.remove('fw-b-over')
    over.current = el
    el?.classList.add('fw-b-over')
  }
  const hit = (t: EventTarget | null) => (t instanceof Element ? t.closest('[data-fw-path], [data-fw-ip]') : null)
  const read = (el: Element | null): { path?: Path; ip?: Ip } =>
    !el ? {} : el.hasAttribute('data-fw-path') ? { path: el.getAttribute('data-fw-path')!.split('.') } : { ip: el.getAttribute('data-fw-ip')!.split('.').map(Number) }
  if (p.issues) return h('div', { ref: box, className: 'fw-b-canvas' }, h('p', { className: 'fw-error' }, 'Fix the issues above to see the form.'))
  // keys and places are checked by lint() (letters, digits, _), so they are safe inside the selector
  const sel = p.selected ? `[data-fw-path="${p.selected.join('.')}"]` : p.node ? `[data-fw-ip="${p.node.join('.')}"]` : ''
  return h('div', {
    ref: box, className: 'fw-b-canvas', tabIndex: -1, 'aria-label': 'The form: click a part to change it, double-click a label to retype it',
    onDoubleClick: (e: MouseEvent) => startTyping(e.target),
    onClickCapture: (e: MouseEvent) => {
      const t = e.target as Element
      if (t.closest('.fw-steps button, [role=tab], summary, .fw-nav button, .fw-b-devices, .fw-b-inline')) return // moving between pages still works
      e.preventDefault()
      e.stopPropagation()
      const at = read(hit(t))
      if (at.path) p.select(at.path)
      else if (at.ip) p.selectNode(at.ip)
      else p.select(null)
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Escape' && p.wide) return p.setWide(false)
      if (e.key !== 'Delete' || (e.target as Element).closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      p.remove()
    },
    onDragStart: (e: DragEvent) => {
      const at = read(hit(e.target))
      if (at.path) e.dataTransfer.setData('text/x-fw-path', at.path.join('.'))
      else if (at.ip) e.dataTransfer.setData('text/x-fw-node', at.ip.join('.'))
      e.stopPropagation()
    },
    onDragOver: (e: DragEvent) => { e.preventDefault(); mark(hit(e.target) ?? e.currentTarget) },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) mark(null) },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      mark(null)
      p.drop(e.dataTransfer, read(hit(e.target)))
    },
  },
    sel && h('style', null, `.fw-b-canvas ${sel} { outline: 2px solid var(--fw-accent) !important; outline-offset: 3px; }`),
    typing && h('input', {
      className: 'fw-b-inline', autoFocus: true, value: typing.words, style: typing.style, 'aria-label': 'Label',
      onChange: (e: ChangeEvent<HTMLInputElement>) => setTyping({ ...typing, words: e.target.value }),
      onKeyDown: (e: KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Enter') stopTyping(true); else if (e.key === 'Escape') stopTyping(false) },
      onBlur: () => stopTyping(true),
      onFocus: (e: { target: HTMLInputElement }) => e.target.select(),
    }),
    h('div', { className: 'fw-b-devices', role: 'group', 'aria-label': 'Show it as on' },
      DEVICES.map(([k, , w]) => h('button', { key: k, type: 'button', 'aria-pressed': device === k, title: `${w}px wide`, onClick: () => setDevice(k) }, p.labels[k])),
      h('small', null, `${width}px${zoom < 1 ? ` · ${Math.round(zoom * 100)}%` : ''}`),
      p.wide && h('button', { type: 'button', className: 'fw-b-wide-go', 'aria-pressed': p.adding, title: p.adding ? 'Put the palette away' : 'Open the palette: click an input or drag it onto the form', onClick: () => p.setAdding(!p.adding) },
        p.adding ? p.labels.closePalette : p.labels.openPalette),
      h('button', { type: 'button', className: 'fw-b-wide-go', 'aria-pressed': p.wide, title: p.wide ? 'Bring back the palette and the settings (Esc)' : 'Hide the palette and the form settings: the canvas gets all the room', onClick: () => p.setWide(!p.wide) },
        p.wide ? p.labels.exitFullWidth : p.labels.fullWidth)),
    h('div', { className: 'fw-b-device', 'data-device': device, style: { width, zoom } }, h(Form, { schema: p.schema, design: true })))
}
