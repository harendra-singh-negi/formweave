// The Layout tab: the layout as a tree, each piece marked with what it is.
import { createElement as h, Fragment, useState, type DragEvent, type ReactNode } from 'react'
import { text } from '../../core/form.ts'
import { Form } from '../../react.ts'
import type { Fields, FormSchema, Layout, Values } from '../../core/schema.ts'
import { dragEnd, dragLeave, dragOver } from '../drag.ts'
import { fits, type Ip, isContainer, layoutEdits, nodeAt, placedKeys } from '../layout-edits.ts'
import { ImagePicker } from '../panels/image-picker.ts'
import { fromNodeSettings, NODE_SETTINGS, NODES, nodeSettings } from '../settings/layout-settings.ts'
import type { Kind } from '../types.ts'

export const FIELD_ICONS: Record<Kind, string> = { string: 'Aa', number: '#', boolean: '☑', choice: '◉', date: '◷', file: '⎙', group: '▣', list: '☰' }

export interface LayoutTabProps {
  schema: FormSchema
  commit(layout: Layout[] | undefined, typing?: boolean): void
  panel: number
  bump(): void
}

export function LayoutTab({ schema, commit, panel, bump }: LayoutTabProps) {
  const [sel, setSel] = useState<Ip | null>(null)
  const items = schema.layout
  if (!items)
    return h('div', { className: 'fw-b-layout-empty' },
      h('p', null, 'Fields show one after another. Start a layout to group them into sections, columns or steps.'),
      h('div', { className: 'fw-b-bar' },
        h('button', { type: 'button', onClick: () => commit([{ type: 'pages', display: 'steps', children: [{ type: 'section', title: 'Step 1', children: Object.keys(schema.fields) }] }]) }, 'Make it a stepper'),
        h('button', { type: 'button', onClick: () => commit(Object.keys(schema.fields)) }, 'Start a layout')))

  const node = sel ? nodeAt(items, sel) : undefined
  const select = (ip: Ip | null) => { setSel(ip); bump() }
  /** Where a new node goes: into the selected container, else after the selected node, else at the end. */
  const target = (n: Layout): [Ip, number] => {
    if (sel && isContainer(node) && fits(items, sel, n)) return [sel, node.children.length]
    if (sel && fits(items, sel.slice(0, -1), n)) return [sel.slice(0, -1), sel.at(-1)! + 1]
    return [[], items.length]
  }
  const add = (n: Layout) => {
    const [parent, index] = target(n)
    commit(layoutEdits.insert(items, parent, index, n))
    select([...parent, index])
  }
  const unplaced = Object.keys(schema.fields).filter((k) => !placedKeys(items).includes(k))
  const move = (from: Ip, parent: Ip, index: number) => {
    const next = layoutEdits.move(items, from, parent, index)
    if (next) { commit(next); select(null) }
  }
  const insert = (parent: Ip, index: number, n: Layout) => {
    if (!fits(items, parent, n)) return
    commit(layoutEdits.insert(items, parent, index, n))
    select([...parent, index])
  }
  const newNode = (n: () => Layout) => ({ draggable: true, title: 'Click to add, or drag it into place', onDragStart: (e: DragEvent) => e.dataTransfer.setData('text/x-fw-new', JSON.stringify(n())) })
  const onSettings = (v: Values) => {
    if (!sel || typeof node !== 'object') return
    const next = fromNodeSettings(node, v)
    if (JSON.stringify(next) !== JSON.stringify(node)) commit(layoutEdits.replace(items, sel, next), true)
  }

  return h('div', { className: 'fw-b-main' },
    h('div', { className: 'fw-b-palette', 'aria-label': 'Add to the layout' },
      h('h3', null, 'Add'),
      NODES.map(([k, label, make]) => h('button', { key: k, type: 'button', onClick: () => add(make()), ...newNode(make) }, '+ ', label)),
      unplaced.length > 0 && h('h3', null, 'Not placed'),
      unplaced.map((k) => h('button', { key: k, type: 'button', onClick: () => add(k), ...newNode(() => k) }, '+ ', text(schema.fields[k].label, 'en') || k))),
    h('div', { className: 'fw-b-tree' },
      h('h3', null, 'Layout'),
      h(LayoutTree, { items: items, all: items, parent: [], sel, select, move, insert, schema,
            remove: (ip: Ip) => { commit(isContainer(nodeAt(items, ip)) ? layoutEdits.unwrap(items, ip) : layoutEdits.remove(items, ip)); select(null) } }),
      h('p', null, h('button', { type: 'button', onClick: () => { commit(undefined); select(null) } }, 'Remove the layout'))),
    h('div', { className: 'fw-b-settings' },
      typeof node === 'object'
        ? h(Fragment, null, h('h3', null, node.type === 'content' ? 'Content' : node.type, ' settings'),
            h(Form, { key: panel, schema: NODE_SETTINGS[node.type], values: nodeSettings(node), widgets: { image: ImagePicker }, labels: { submit: 'Done' }, onChange: (s) => onSettings(s.values), onSubmit: () => select(null) }))
        : h('p', { className: 'fw-help' }, typeof node === 'string' ? 'A field. Change it on the Fields tab.' : 'Select a section, grid, page or text to change it. Drag anything to move it.')))
}

export interface LayoutTreeProps {
  items: Layout[]
  all: Layout[]
  parent: Ip
  sel: Ip | null
  schema: FormSchema
  select(ip: Ip): void
  move(from: Ip, parent: Ip, index: number): void
  insert(parent: Ip, index: number, n: Layout): void
  remove(ip: Ip): void
}

export function LayoutTree(p: LayoutTreeProps): ReactNode {
  const drop = (e: DragEvent, index: number) => {
    dragEnd(e)
    const made = e.dataTransfer.getData('text/x-fw-new')
    if (made) {
      e.preventDefault()
      e.stopPropagation()
      return p.insert(p.parent, index, JSON.parse(made))
    }
    const raw = e.dataTransfer.getData('text/x-fw-node')
    if (!raw) return
    e.preventDefault()
    e.stopPropagation()
    p.move(raw.split('.').map(Number), p.parent, index)
  }
  /** [icon, what it says, what it is] */
  const name = (n: Layout): [string, string, string] => {
    if (typeof n === 'string') {
      const f = p.schema.fields[n]
      return [FIELD_ICONS[f?.type ?? 'string'], text(f?.label, 'en') || n, `${n} · ${f?.type ?? 'missing'}`]
    }
    switch (n.type) {
      case 'section': return ['▤', text(n.title, 'en') || 'Section without a title', 'section']
      case 'grid': {
        const c = typeof n.cols === 'number' ? { base: 1, md: n.cols } : (n.cols ?? { base: 1 })
        return ['▥', `${Math.max(...Object.values(c).map(Number))} columns`, `grid · ${c.base ?? 1} on phones`]
      }
      case 'pages': return ['⧉', `${n.children.length} ${n.display ?? 'steps'}`, `pages${n.position && n.display !== 'accordion' ? ` · ${n.position}` : ''}`]
      case 'content':
        if (n.as === 'image') return ['▨', text(n.alt, 'en') || (n.src ? 'Image' : 'Image (none picked yet)'), 'image']
        return [n.as === 'divider' ? '—' : n.as === 'heading' ? 'H' : '¶', n.as === 'divider' ? 'Divider' : text(n.text, 'en').replace(/<[^>]*>/g, ' ').trim().slice(0, 60) || '…', n.as ?? 'text']
    }
  }
  return h('ul', { className: 'fw-b-list', onDragOver: (e: DragEvent) => e.preventDefault(), onDrop: (e: DragEvent) => drop(e, p.items.length) },
    p.items.length === 0 && h('li', { className: 'fw-b-drop', onDragOver: dragOver, onDragLeave: dragLeave, onDrop: (e: DragEvent) => drop(e, 0) }, 'Empty: drag something here'),
    p.items.map((n, i): ReactNode => {
      const ip = [...p.parent, i]
      const on = !!p.sel && p.sel.join('.') === ip.join('.')
      const [icon, title, kind] = name(n)
      const siblings = p.items.length
      return h('li', { key: i, onDragOver: dragOver, onDragLeave: dragLeave, onDrop: (e: DragEvent) => drop(e, i) },
        h('div', { className: 'fw-b-item', 'aria-current': on || undefined },
          h('button', {
            type: 'button', className: `fw-b-pick${isContainer(n) ? ' fw-b-box' : ''}`, draggable: true, onClick: () => p.select(ip), title: `${title} (${kind})`,
            onDragStart: (e: DragEvent) => { e.stopPropagation(); e.dataTransfer.setData('text/x-fw-node', ip.join('.')) },
          }, h('span', { className: 'fw-b-ico', 'aria-hidden': true }, icon), h('span', { className: 'fw-b-name' }, title), h('small', null, kind)),
          on && h('span', { className: 'fw-b-tools' },
            h('button', { type: 'button', 'aria-label': 'Move up', disabled: i === 0, onClick: () => p.move(ip, p.parent, i - 1) }, '↑'),
            h('button', { type: 'button', 'aria-label': 'Move down', disabled: i === siblings - 1, onClick: () => p.move(ip, p.parent, i + 2) }, '↓'),
            h('button', { type: 'button', 'aria-label': isContainer(n) ? 'Remove, keep what is inside' : 'Remove from the layout', onClick: () => p.remove(ip) }, '✕'))),
        isContainer(n) && h(LayoutTree, { ...p, items: n.children, parent: ip }))
    }))
}
