// A phone number with its country calling code.
import { createElement as h, useState, type ChangeEvent } from 'react'
import { COUNTRIES, DIAL, countryName } from '../../core/countries.ts'
import type { StringField } from '../../core/schema.ts'
import { useCtx, type WidgetProps } from '../context.ts'
import { aria, textValue } from '../shell.ts'

/** A country's calling code and the number: '+91 98765 43210'. */
export function Phone(p: WidgetProps) {
  const f = p.field as StringField
  const v = textValue(p.value)
  const m = /^\+(\d{1,4})\s*(.*)$/.exec(v)
  const fits = (k?: string) => (k && Object.hasOwn(DIAL, k) && (!m || DIAL[k] === m[1]) ? k : undefined)
  const [iso, setIso] = useState(() => fits(f.country) ?? (m ? COUNTRIES.find((k) => DIAL[k] === m[1]) : undefined) ?? 'IN')
  const rest = m ? m[2] : v
  const put = (k: string, num: string) => p.set(num.trim() ? `+${DIAL[k]} ${num.trim()}` : null)
  const c = useCtx()
  return h('div', { className: 'fw-phone' },
    h('select', { 'aria-label': `${p.label}: ${c.labels.country}`, disabled: p.readOnly, value: iso, className: p.className,
      onChange: (e: ChangeEvent<HTMLSelectElement>) => { setIso(e.target.value); put(e.target.value, rest) } },
      COUNTRIES.map((k) => [k, countryName(k, p.locale)]).sort((a, b) => a[1].localeCompare(b[1])).map(([k, name]) => h('option', { key: k, value: k }, `${name} (+${DIAL[k]})`))),
    h('input', { ...aria(p), type: 'tel', autoComplete: 'tel-national', readOnly: p.readOnly, value: rest, onBlur: p.touch,
      onChange: (e: ChangeEvent<HTMLInputElement>) => put(iso, e.target.value) }))
}
