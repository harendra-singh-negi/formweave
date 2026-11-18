// Groups and lists: fields together, repeating cards, tables with totals, and matrices.
import { createElement as h, Fragment, type ChangeEvent } from 'react'
import { text } from '../../core/form.ts'
import type { ChoiceField, Field, ListField, NumberField, Values } from '../../core/schema.ts'
import { Context, cx, useCtx, type WidgetProps } from '../context.ts'
import { humanize, Shell } from '../shell.ts'

export function GroupInput(p: WidgetProps) {
  const fields = (p.field as { fields: Record<string, Field> }).fields
  return h(Fragment, null, Object.entries(fields).map(([k, f]) => h(Shell, { key: k, path: `${p.path}.${k}`, field: f })))
}

export function ListInput(p: WidgetProps) {
  const f = p.field as ListField
  const c = useCtx()
  const rows = Array.isArray(p.value) ? p.value : []
  const cols = Object.entries(f.fields)
  const fixed = f.rows?.map((r) => text(r, c.locale))
  const add = !p.readOnly && !fixed && (f.max == null || rows.length < f.max) &&
    h('button', { type: 'button', className: cx('fw-add', c.classes.button), onClick: () => c.form.addRow(p.path) }, c.labels.addRow)
  const remove = (i: number) => !p.readOnly && !fixed && rows.length > (f.min ?? 0) &&
    h('button', { type: 'button', className: 'fw-remove', 'aria-label': `${c.labels.removeRow} ${i + 1}`, onClick: () => c.form.removeRow(p.path, i) }, '×')
  const cell = (i: number, k: string, field: Field) => h(Shell, { key: k, path: `${p.path}.${i}.${k}`, field })
  const scale = cols.find(([, sf]) => sf.type === 'choice') as [string, ChoiceField] | undefined
  if (f.widget === 'matrix' && fixed && scale) return h(Matrix, { ...p, scale, fixed })
  if (f.widget === 'table' || f.widget === 'matrix')
    return h(Fragment, null,
      h('div', { className: 'fw-table-wrap' },
        h('table', { className: 'fw-table' },
          h('thead', null, h('tr', null, h('th', { className: fixed ? 'fw-fixed' : 'fw-n' }, fixed ? text(f.rowHeading, c.locale) : '#'), cols.map(([k, sf]) => h('th', { key: k, 'data-fw-path': c.design ? `${p.path}.${k}` : undefined }, text(sf.label, c.locale) || humanize(k))), h('th', { className: 'fw-n' }))),
          h('tbody', null, rows.map((_, i) => h('tr', { key: i },
            fixed ? h('th', { scope: 'row', className: 'fw-fixed' }, fixed[i]) : h('td', { className: 'fw-n', 'data-label': c.labels.row }, i + 1),
            cols.map(([k, sf]) => h('td', { key: k }, h(Context.Provider, { value: { ...c, compact: true } }, cell(i, k, sf)))),
            h('td', { className: 'fw-n' }, remove(i))))),
          f.totals?.length ? h('tfoot', null, h('tr', null,
            h('th', { scope: 'row', className: fixed ? 'fw-fixed' : 'fw-n' }, c.labels.total),
            cols.map(([k, sf]) => {
              if (!f.totals!.includes(k)) return h('td', { key: k })
              const sum = (rows as Values[]).reduce((t, r) => t + (Number(r?.[k]) || 0), 0)
              const n = sf as NumberField
              return h('td', { key: k, className: 'fw-total', 'data-label': text(sf.label, c.locale) || humanize(k) },
                new Intl.NumberFormat(c.locale ?? 'en', n.format === 'currency' && n.currency ? { style: 'currency', currency: n.currency } : { maximumFractionDigits: n.decimals ?? 2 }).format(sum))
            }),
            h('td', { className: 'fw-n' }))) : null)),
      add)
  return h(Fragment, null,
    rows.map((_, i) => h('div', { key: i, className: 'fw-row' },
      h('div', { className: 'fw-row-head' }, h('span', null, fixed ? fixed[i] : `${c.labels.row} ${i + 1}`), remove(i)),
      cols.map(([k, sf]) => cell(i, k, sf)))),
    add)
}

/**
 * A list with fixed rows shown as a grid: one row per statement, the options of its first choice field as columns,
 * a radio (or a tick box, when it allows several) in each cell. Its other fields follow as ordinary columns.
 */
export function Matrix(p: WidgetProps & { scale: [string, ChoiceField]; fixed: string[] }) {
  const c = useCtx()
  const [key, sf] = p.scale
  const opts = sf.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: text(o.label, c.locale) || o.value }))
  const rest = Object.entries((p.field as ListField).fields).filter(([k]) => k !== key)
  const rows = Array.isArray(p.value) ? (p.value as Values[]) : []
  const touched = (path: string) => c.state.submitted || !!c.state.touched[path] || !!c.state.touched[p.path]
  return h('div', { className: 'fw-table-wrap' },
    h('table', { className: 'fw-table fw-matrix' },
      h('thead', null, h('tr', null,
        h('th', { className: 'fw-fixed' }, text((p.field as ListField).rowHeading, c.locale)),
        opts.map((o) => h('th', { key: o.value, className: 'fw-m-opt', 'data-fw-path': c.design ? `${p.path}.${key}` : undefined }, o.label)),
        rest.map(([k, x]) => h('th', { key: k, 'data-fw-path': c.design ? `${p.path}.${k}` : undefined }, text(x.label, c.locale) || humanize(k))))),
      h('tbody', null, p.fixed.map((name, i) => {
        const path = `${p.path}.${i}.${key}`
        const v = rows[i]?.[key]
        const picked = sf.multiple ? (Array.isArray(v) ? (v as string[]) : []) : [v]
        const e = c.state.errors[path]
        const error = e && touched(path) ? e.message : undefined
        const errId = `${c.id}${path}-error`
        const readOnly = p.readOnly || !!c.state.fields[path]?.readOnly
        return h('tr', { key: i },
          h('th', { scope: 'row', className: 'fw-fixed' }, name, error && h('div', { id: errId, className: cx('fw-error', c.classes.error) }, error)),
          opts.map((o) => h('td', { key: o.value, className: 'fw-m-opt', 'data-label': o.label },
            h('input', {
              type: sf.multiple ? 'checkbox' : 'radio', name: `${c.id}${path}`, value: o.value, 'aria-label': `${name}: ${o.label}`,
              checked: picked.includes(o.value), disabled: readOnly, onBlur: () => c.form.touch(path),
              'aria-invalid': error ? true : undefined, 'aria-describedby': error ? errId : undefined,
              onChange: (ev: ChangeEvent<HTMLInputElement>) => c.form.set(path, !sf.multiple ? o.value : ev.target.checked ? [...picked, o.value] : picked.filter((x) => x !== o.value)),
            }))),
          rest.map(([k, x]) => h('td', { key: k }, h(Context.Provider, { value: { ...c, compact: true } }, h(Shell, { path: `${p.path}.${i}.${k}`, field: x })))))
      }))))
}
