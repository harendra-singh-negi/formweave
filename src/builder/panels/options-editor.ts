// A choice's options, a line each, with paste-a-list and conditions.
import { createElement as h, Fragment, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import type { WidgetProps } from '../../react.ts'
import type { Values } from '../../core/schema.ts'
import { formula } from '../settings/field-settings.ts'

export function OptionsEditor(p: WidgetProps) {
  const rows = (Array.isArray(p.value) ? p.value : []) as Values[]
  const box = useRef<HTMLDivElement>(null)
  const [conditions, setConditions] = useState(() => rows.some((r) => r.visible))
  const [bulk, setBulk] = useState<string | null>(null)
  const put = (i: number, k: string, v: string) => p.set(rows.map((r, j) => (j === i ? { ...r, [k]: v || null } : r)))
  const focusRow = (i: number) => setTimeout(() => box.current?.querySelectorAll<HTMLInputElement>('.fw-b-opt > input:first-child')[i]?.focus())
  const insert = (i: number) => {
    p.set([...rows.slice(0, i), { value: null, label: null, visible: null }, ...rows.slice(i)])
    focusRow(i)
  }
  const move = (i: number, by: number) => {
    const j = i + by
    if (j < 0 || j >= rows.length) return
    p.set(rows.map((r, k) => (k === i ? rows[j] : k === j ? rows[i] : r)))
  }
  const paste = () => {
    const lines = (bulk ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length) p.set(lines.map((l) => {
      const [value, label] = l.split('|').map((x) => x.trim())
      return { value, label: label || null, visible: null }
    }))
    setBulk(null)
  }
  const field = (i: number, k: string, label: string, extra: object = {}) => h('input', {
    type: 'text', value: String(rows[i]?.[k] ?? ''), 'aria-label': `Option ${i + 1}: ${label}`, readOnly: p.readOnly, ...extra,
    onChange: (e: ChangeEvent<HTMLInputElement>) => put(i, k, e.target.value),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); insert(i + 1) } },
  })
  const tool = (label: string, title: string, onClick: () => void, disabled = false) =>
    h('button', { type: 'button', title, 'aria-label': title, disabled: disabled || p.readOnly, onClick }, label)
  return h('div', { ref: box, className: 'fw-b-opts' },
    bulk !== null
      ? h('div', { className: 'fw-b-opts-bulk' },
          h('textarea', { rows: 8, value: bulk, 'aria-label': 'Options, one per line', placeholder: 'Loading\nDischarging\nIGS | IGS in operation', onChange: (e: ChangeEvent<HTMLTextAreaElement>) => setBulk(e.target.value) }),
          h('p', { className: 'fw-help' }, 'One option per line. "value | label" when people should read something else. This replaces the list.'),
          h('div', { className: 'fw-b-bar' }, tool('Use these', 'Replace the options with these lines', paste), tool('Cancel', 'Keep the options as they are', () => setBulk(null))))
      : h(Fragment, null,
          h('div', { className: 'fw-b-opt fw-b-opt-head', 'aria-hidden': true }, h('span', null, 'Value'), h('span', null, 'Label (if different)')),
          rows.map((r, i) => h('div', { key: i, className: 'fw-b-opt' },
            field(i, 'value', 'value', { 'aria-invalid': !r.value || undefined }),
            field(i, 'label', 'label', { placeholder: String(r.value ?? '') }),
            h('span', { className: 'fw-b-tools' },
              tool('↑', `Move option ${i + 1} up`, () => move(i, -1), i === 0),
              tool('✕', `Remove option ${i + 1}`, () => p.set(rows.filter((_, j) => j !== i)), rows.length <= 1)),
            conditions && field(i, 'visible', 'show only when', { className: 'fw-b-opt-when', placeholder: "Show only when, e.g. state == 'Maharashtra'" }))),
          h('div', { className: 'fw-b-bar' },
            tool('+ Option', 'Add an option at the end', () => insert(rows.length)),
            tool('Paste a list', 'Type or paste many options at once', () => setBulk(rows.map((r) => (r.label ? `${r.value ?? ''} | ${r.label}` : String(r.value ?? ''))).join('\n'))),
            h('label', { className: 'fw-b-opts-cond', title: 'Offer an option only while a formula holds: cascading choices' },
              h('input', { type: 'checkbox', checked: conditions, onChange: (e: ChangeEvent<HTMLInputElement>) => setConditions(e.target.checked) }), ' Conditions'))))
}
