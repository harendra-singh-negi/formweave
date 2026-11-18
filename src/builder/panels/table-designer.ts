// A table or matrix drawn as it will look, its headings and rows typed in place.
import { createElement as h, Fragment, useState, type ChangeEvent } from 'react'
import { text } from '../../core/form.ts'
import type { ChoiceField, Field, ListField } from '../../core/schema.ts'
import { nameFor } from '../a11y.ts'

export const NEW_COLUMNS: [string, string, Field][] = [
  ['text', 'Text', { type: 'string', label: 'Text' }],
  ['number', 'Number', { type: 'number', label: 'Number' }],
  ['amount', 'Amount', { type: 'number', label: 'Amount', decimals: 2 }],
  ['date', 'Date', { type: 'date', label: 'Date' }],
  ['choice', 'Dropdown', { type: 'choice', label: 'Choice', widget: 'select', options: ['Option 1', 'Option 2'] }],
  ['yesNo', 'Yes / No', { type: 'choice', label: 'Yes / No', widget: 'buttons', options: ['Yes', 'No'] }],
  ['check', 'Tick box', { type: 'boolean', label: 'Done' }],
]

export interface TableDesignerProps {
  field: ListField
  set(f: ListField): void
  /** Opens a column's own settings. */
  pick(key: string): void
}

/**
 * A table drawn as it will look, with its headings and rows typed in place: add, move and remove columns and rows,
 * and tick the number columns that get a total. For a matrix the columns are the options of its choice.
 */
export function TableDesigner({ field: f, set, pick }: TableDesignerProps) {
  const cols = Object.entries(f.fields)
  const scale = f.widget === 'matrix' ? (cols.find(([, x]) => x.type === 'choice') as [string, ChoiceField] | undefined) : undefined
  const rows = f.rows?.map((r) => text(r, 'en'))
  const swap = <T,>(list: T[], i: number, j: number) => (j < 0 || j >= list.length ? list : list.map((x, k) => (k === i ? list[j] : k === j ? list[i] : x)))
  const withCols = (entries: [string, Field][], extra: Partial<ListField> = {}) => {
    const keys = new Set(entries.map(([k]) => k))
    const totals = f.totals?.filter((k) => keys.has(k) && entries.find(([x]) => x === k)![1].type === 'number')
    const next: ListField = { ...f, ...extra, fields: Object.fromEntries(entries) }
    if (totals?.length) next.totals = totals
    else delete next.totals
    set(next)
  }
  const setRows = (r: string[]) => {
    const next: ListField = { ...f }
    if (r.length) next.rows = r
    else { delete next.rows; delete next.rowHeading }
    set(next)
  }
  const [kind, setKind] = useState('text')
  // a column of a table, or an option of a matrix
  const heads = scale
    ? scale[1].options.map((o) => (typeof o === 'string' ? o : text(o.label, 'en') || o.value))
    : cols.map(([k, x]) => text(x.label, 'en') || k)
  const setOptions = (opts: ChoiceField['options']) => withCols(cols.map(([k, x]) => [k, k === scale![0] ? { ...x, options: opts } as Field : x]))
  const rename = (i: number, v: string) => {
    if (scale) return setOptions(scale[1].options.map((o, j) => (j !== i ? o : typeof o === 'string' ? v : { ...o, label: v })))
    withCols(cols.map(([k, x], j) => [k, j === i ? ({ ...x, label: v } as Field) : x]))
  }
  const shift = (i: number, by: number) => (scale ? setOptions(swap(scale[1].options, i, i + by)) : withCols(swap(cols, i, i + by)))
  const drop = (i: number) => (scale ? scale[1].options.length > 2 && setOptions(scale[1].options.filter((_, j) => j !== i)) : withCols(cols.filter((_, j) => j !== i)))
  const addCol = () => {
    if (scale) return setOptions([...scale[1].options, `Option ${scale[1].options.length + 1}`])
    const [base, , make] = NEW_COLUMNS.find(([k]) => k === kind)!
    let n = 1
    while (Object.hasOwn(f.fields, base + n)) n++
    withCols([...cols, [base + n, structuredClone(make)]])
  }
  const tool = (label: string, title: string, onClick: () => void, disabled = false) =>
    h('button', { type: 'button', title, 'aria-label': nameFor(label, title), disabled, onClick }, label)
  const numbers = cols.filter(([k, x]) => x.type === 'number' && k !== scale?.[0])
  return h('div', { className: 'fw-b-td' },
    h('h3', null, scale ? 'Matrix' : 'Table', ' designer'),
    h('div', { className: 'fw-b-td-wrap' },
      h('table', null,
        h('thead', null, h('tr', null,
          rows && h('th', null, h('input', { 'aria-label': 'Heading over the rows', placeholder: 'Row heading', value: text(f.rowHeading, 'en'),
            onChange: (e: ChangeEvent<HTMLInputElement>) => { const next: ListField = { ...f, rowHeading: e.target.value }; if (!e.target.value) delete next.rowHeading; set(next) } })),
          heads.map((label, i) => h('th', { key: i },
            h('input', { 'aria-label': `${scale ? 'Option' : 'Column'} ${i + 1} heading`, value: label, onChange: (e: ChangeEvent<HTMLInputElement>) => rename(i, e.target.value) }),
            h('span', { className: 'fw-b-tools' },
              tool('←', 'Move left', () => shift(i, -1), i === 0),
              tool('→', 'Move right', () => shift(i, 1), i === heads.length - 1),
              !scale && tool('⚙', 'Column settings', () => pick(cols[i][0])),
              tool('✕', scale ? 'Remove option' : 'Remove column', () => drop(i), scale ? heads.length <= 2 : false)),
            !scale && h('small', null, cols[i][0], ' · ', cols[i][1].type))),
          h('th', { className: 'fw-b-td-add' },
            !scale && h('select', { 'aria-label': 'New column type', value: kind, onChange: (e: ChangeEvent<HTMLSelectElement>) => setKind(e.target.value) },
              NEW_COLUMNS.map(([k, label]) => h('option', { key: k, value: k }, label))),
            tool(scale ? '+ Option' : '+ Column', scale ? 'Add an option' : 'Add a column', addCol)))),
        h('tbody', null,
          rows?.map((r, i) => h('tr', { key: i },
            h('th', null,
              h('input', { 'aria-label': `Row ${i + 1}`, value: r, onChange: (e: ChangeEvent<HTMLInputElement>) => setRows(rows.map((x, j) => (j === i ? e.target.value : x))) }),
              h('span', { className: 'fw-b-tools' },
                tool('↑', 'Move up', () => setRows(swap(rows, i, i - 1)), i === 0),
                tool('↓', 'Move down', () => setRows(swap(rows, i, i + 1)), i === rows.length - 1),
                tool('✕', 'Remove row', () => setRows(rows.filter((_, j) => j !== i)), f.widget === 'matrix' && rows.length <= 1))),
            heads.map((_, j) => h('td', { key: j }, scale ? '○' : '')),
            h('td'))),
          !rows && h('tr', null, h('td', { colSpan: heads.length + 1, className: 'fw-help' },
            `People add rows with "+ Add row". It starts with ${f.min ?? 0} and allows ${f.max ?? 'any number'}.`)),
          !scale && numbers.length > 0 && h('tr', { className: 'fw-b-td-totals' },
            rows && h('th', null, 'Total'),
            cols.filter(([k]) => k !== scale?.[0]).map(([k, x]) => h('td', { key: k }, x.type === 'number' && h('label', null,
              h('input', { type: 'checkbox', checked: !!f.totals?.includes(k), onChange: (e: ChangeEvent<HTMLInputElement>) => {
                const t = e.target.checked ? [...(f.totals ?? []), k] : (f.totals ?? []).filter((x) => x !== k)
                const next: ListField = { ...f, totals: t }
                if (!t.length) delete next.totals
                set(next)
              } }), ' Sum'))),
            h('td'))))),
    h('div', { className: 'fw-b-bar' },
      rows
        ? h(Fragment, null,
            tool('+ Row', 'Add a row', () => setRows([...rows, `Row ${rows.length + 1}`])),
            f.widget !== 'matrix' && tool('Let people add rows', 'Remove the fixed rows: people add rows while filling it in', () => setRows([])))
        : tool('Use fixed rows', 'Rows you name, the same for everyone (Monday, Tuesday…)', () => setRows(['Row 1', 'Row 2']))))
}
