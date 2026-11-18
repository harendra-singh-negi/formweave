// Numbers: plain, money, percent, a stepper, a slider or stars.
import { createElement as h, type ChangeEvent } from 'react'
import { text } from '../../core/form.ts'
import type { NumberField } from '../../core/schema.ts'
import type { WidgetProps } from '../context.ts'
import { aria, textValue } from '../shell.ts'

export function NumberInput(p: WidgetProps) {
  const f = p.field as NumberField
  if (f.widget === 'slider') {
    const min = f.min ?? 0
    const max = f.max ?? 100
    return h(
      'div',
      { className: 'fw-slider' },
      h('input', {
        ...aria(p),
        type: 'range',
        min,
        max,
        step: f.decimals != null ? 10 ** -f.decimals : 1,
        disabled: p.readOnly,
        value: p.value == null ? min : String(p.value),
        onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.value),
        onBlur: p.touch,
      }),
      h('output', { htmlFor: p.id }, p.value == null ? '—' : String(p.value)),
    )
  }
  if (f.widget === 'stepper') {
    const step = f.decimals != null ? 10 ** -f.decimals : 1
    const n = typeof p.value === 'number' ? p.value : null
    const bump = (d: number) => {
      const next = Math.round(((n ?? f.min ?? 0) + d * step) / step) * step
      p.set(Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, next)))
      p.touch()
    }
    return h(
      'div',
      { className: 'fw-stepper' },
      h(
        'button',
        { type: 'button', 'aria-label': `− ${p.label}`, disabled: p.readOnly || (n != null && f.min != null && n <= f.min), onClick: () => bump(-1) },
        '−',
      ),
      h('input', {
        ...aria(p),
        type: 'number',
        inputMode: 'decimal',
        readOnly: p.readOnly,
        value: textValue(p.value),
        min: f.min,
        max: f.max,
        step,
        onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.value),
        onBlur: p.touch,
      }),
      h(
        'button',
        { type: 'button', 'aria-label': `+ ${p.label}`, disabled: p.readOnly || (n != null && f.max != null && n >= f.max), onClick: () => bump(1) },
        '+',
      ),
    )
  }
  if (f.widget === 'rating') {
    const n = f.max ?? 5
    const v = Number(p.value) || 0
    return h(
      'div',
      { ...aria(p), role: 'radiogroup', 'aria-label': p.label, className: 'fw-rating' },
      Array.from({ length: n }, (_, j) => j + 1).map((k) =>
        h(
          'label',
          { key: k },
          h('input', {
            type: 'radio',
            className: 'fw-sr',
            name: p.id,
            value: k,
            checked: v === k,
            disabled: p.readOnly,
            onChange: () => p.set(k),
            onBlur: p.touch,
          }),
          h('span', { 'aria-hidden': true, className: k <= v ? 'fw-on' : undefined }, '★'),
          h('span', { className: 'fw-sr' }, `${k} / ${n}`),
        ),
      ),
    )
  }
  const before = f.format === 'currency' && f.currency ? currencySymbol(f.currency, p.locale) : undefined
  const after = f.format === 'percent' ? '%' : undefined
  const input = h('input', {
    ...aria(p),
    type: 'number',
    inputMode: 'decimal',
    readOnly: p.readOnly,
    value: textValue(p.value),
    min: f.min,
    max: f.max,
    step: f.decimals != null ? 10 ** -f.decimals : 'any',
    placeholder: text(f.placeholder, p.locale) || undefined,
    onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.value),
    onBlur: p.touch,
  })
  return before || after
    ? h('div', { className: 'fw-affix' }, before && h('span', { 'aria-hidden': true }, before), input, after && h('span', { 'aria-hidden': true }, after))
    : input
}

export const currencySymbol = (code: string, locale?: string) => {
  try {
    return new Intl.NumberFormat(locale ?? 'en', { style: 'currency', currency: code }).formatToParts(0).find((x) => x.type === 'currency')?.value
  } catch {
    return code // an unknown code: show it as it is
  }
}
