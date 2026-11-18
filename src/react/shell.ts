// The frame around every input: its label, help and error, tied together for screen readers.
import { createElement as h, Fragment } from 'react'
import { text } from '../core/form.ts'
import type { Field, Values } from '../core/schema.ts'
import { cx, useCtx, type WidgetProps } from './context.ts'

export const humanize = (key: string) => key.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase()).replace(/ \w/g, (s) => s.toLowerCase())
export const at = (values: Values, path: string) => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Values)[k] : undefined), values)

/** Label, help and error around a widget. */
export function Shell({ path, field }: { path: string; field: Field }) {
  const c = useCtx()
  const st = c.state.fields[path]
  const hidden = !st?.visible || field.widget === 'hidden'
  if (!st || (hidden && !c.design)) return null
  // a table's cells name their column ('items.qty'), not the row, so every cell of it is that field
  const own = c.design ? { 'data-fw-path': path.replace(/\.\d+(?=\.|$)/g, ''), 'data-fw-hidden': hidden || undefined, draggable: true } : {}
  const id = `${c.id}${path}`
  const parts = path.split('.')
  const touched = c.state.submitted || parts.some((_, i) => c.state.touched[parts.slice(0, i + 1).join('.')])
  const e = c.state.errors[path]
  const error = e && touched ? e.message : undefined
  const label = text(field.label, c.locale) || humanize(parts[parts.length - 1])
  const help = text(field.help, c.locale)
  const describedBy = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  const Widget = c.widgets[field.widget ?? ''] ?? c.widgets[field.type]
  const control = h(Widget, {
    field, path, id, label, error, describedBy, locale: c.locale,
    value: at(c.state.values, path), required: st.required, readOnly: st.readOnly, className: c.classes.input,
    set: (v: unknown) => c.form.set(path, v), touch: () => c.form.touch(path),
  })
  const mark = st.required && h('span', { className: 'fw-required', 'aria-hidden': true }, ' *')
  const notes = h(Fragment, null,
    help && h('div', { id: `${id}-help`, className: cx('fw-help', c.classes.help) }, help),
    error && h('div', { id: `${id}-error`, className: cx('fw-error', c.classes.error) }, error))
  const wrap = (kind?: string) => cx('fw-field', kind, c.classes.field, field.className)
  if (field.type === 'group' || field.type === 'list') {
    // no label: no title on screen, the key still names it for screen readers
    const legend = text(field.label, c.locale)
    return h('fieldset', { className: wrap(`fw-${field.type}`), 'aria-label': legend ? undefined : label, ...own },
      legend && h('legend', { className: c.classes.label }, legend, mark), control, notes)
  }
  if (field.type === 'boolean')
    return h('div', { className: wrap('fw-check'), ...own }, h('label', { htmlFor: id, className: c.classes.label }, control, ' ', c.compact ? h('span', { className: 'fw-sr' }, label) : label, mark), notes)
  return h('div', { className: wrap(), ...own }, h('label',{ htmlFor: id, className: cx(c.compact && 'fw-sr', c.classes.label) }, label, mark), control, notes)
}

export const aria = (p: WidgetProps) => ({
  id: p.id,
  className: p.className,
  'aria-invalid': p.error ? true : undefined,
  'aria-describedby': p.describedBy,
  'aria-required': p.required || undefined,
})
export const textValue = (v: unknown) => (v == null ? '' : String(v))
