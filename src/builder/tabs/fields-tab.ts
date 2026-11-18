// The Fields tab's tree: every field, nested, to pick, reorder and drop into.
import { createElement as h, type DragEvent, type ReactNode } from 'react'
import { text } from '../../core/form.ts'
import type { Fields } from '../../core/schema.ts'
import { dragEnd, dragLeave, dragOver } from '../drag.ts'
import type { Path } from '../types.ts'

export interface TreeProps {
  fields: Fields
  parent: Path
  selected: Path | null
  select(p: Path): void
  move(p: Path, by: -1 | 1): void
  remove(p: Path): void
  duplicate(p: Path): void
  drop(p: Path, before: string | null): void
  place(id: string, parent: Path, before: string | null): void
  /** What an empty group or list says. */
  empty?: string
  /** These fields are a table's columns. */
  columns?: boolean
}

export function Tree(p: TreeProps): ReactNode {
  const same = (a: Path | null, b: Path) => !!a && a.join('.') === b.join('.')
  const onDrop = (e: DragEvent, before: string | null) => {
    dragEnd(e)
    const kind = e.dataTransfer.getData('text/x-fw-kind')
    if (kind) {
      e.preventDefault()
      e.stopPropagation()
      return p.place(kind, p.parent, before)
    }
    const from = e.dataTransfer.getData('text/x-fw-path').split('.')
    // only among siblings: moving between groups would change the data's shape
    if (from.slice(0, -1).join('.') !== p.parent.join('.')) return
    e.preventDefault()
    e.stopPropagation()
    if (from.at(-1) !== before) p.drop(from, before)
  }
  return h('ul', { className: 'fw-b-list', onDragOver: (e: DragEvent) => e.preventDefault(), onDrop: (e: DragEvent) => onDrop(e, null) },
    Object.keys(p.fields).length === 0 && h('li', { className: 'fw-b-drop', onDragOver: dragOver, onDragLeave: dragLeave, onDrop: (e: DragEvent) => onDrop(e, null) },
      p.parent.length ? p.empty : 'Drag a field here, or click one on the left'),
    Object.entries(p.fields).map(([key, f]): ReactNode => {
      const path = [...p.parent, key]
      const on = same(p.selected, path)
      return h('li', { key, onDragOver: dragOver, onDragLeave: dragLeave, onDrop: (e: DragEvent) => onDrop(e, key) },
        h('div', { className: 'fw-b-item', 'aria-current': on || undefined },
          h('button', {
            type: 'button', className: 'fw-b-pick', draggable: true, onClick: () => p.select(path),
            onDragStart: (e: DragEvent) => e.dataTransfer.setData('text/x-fw-path', path.join('.')),
          }, h('span', null, text(f.label, 'en') || key), h('small', null, ` ${key} · ${f.type}${p.columns ? ' · column' : ''}`)),
          on && h('span', { className: 'fw-b-tools' },
            h('button', { type: 'button', 'aria-label': 'Move up', onClick: () => p.move(path, -1) }, '↑'),
            h('button', { type: 'button', 'aria-label': 'Move down', onClick: () => p.move(path, 1) }, '↓'),
            h('button', { type: 'button', 'aria-label': 'Duplicate', onClick: () => p.duplicate(path) }, '⧉'),
            h('button', { type: 'button', 'aria-label': 'Delete', onClick: () => p.remove(path) }, '✕'))),
        (f.type === 'group' || f.type === 'list') && h(Tree, { ...p, fields: f.fields, parent: path, columns: f.type === 'list' && f.widget === 'table', empty: f.type === 'list' && f.widget === 'table'
          ? 'No columns yet. Each field you add here is a column: select the table and click a field type, or drag one here.'
          : 'Empty. Select it and click a field type, or drag one here.' }))
    }))
}
