// Dates and times in their native pickers.
import { createElement as h, type ChangeEvent } from 'react'
import type { DateField } from '../../core/schema.ts'
import type { WidgetProps } from '../context.ts'
import { aria, textValue } from '../shell.ts'

export const DATE_INPUTS = { date: 'date', time: 'time', datetime: 'datetime-local', month: 'month', week: 'week', year: 'number' }

export function DateInput(p: WidgetProps) {
  const f = p.field as DateField
  return h('input', {
    ...aria(p),
    type: DATE_INPUTS[f.format ?? 'date'],
    readOnly: p.readOnly,
    value: textValue(p.value),
    min: f.min,
    max: f.max,
    onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.value),
    onBlur: p.touch,
  })
}
