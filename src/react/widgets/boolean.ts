// Yes / no: a tick box, or a switch.
import { createElement as h, type ChangeEvent } from 'react'
import type { WidgetProps } from '../context.ts'
import { aria } from '../shell.ts'

export function BooleanInput(p: WidgetProps) {
  return h('input', {
    ...aria(p),
    className: undefined,
    type: 'checkbox',
    role: p.field.widget === 'toggle' ? 'switch' : undefined,
    disabled: p.readOnly,
    checked: p.value === true,
    onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.checked),
    onBlur: p.touch,
  })
}
