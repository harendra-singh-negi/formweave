// A one-time code, one box per character.
import { createElement as h, useRef, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react'
import type { StringField } from '../../core/schema.ts'
import type { WidgetProps } from '../context.ts'
import { aria, textValue } from '../shell.ts'

/** One box per character; typing or pasting moves along, Backspace on an empty box goes back. */
export function Otp(p: WidgetProps) {
  const f = p.field as StringField
  const n = f.maxLength ?? 6
  const v = textValue(p.value)
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const put = (i: number, typed: string) => {
    const chars = Array.from({ length: n }, (_, j) => v[j] ?? '')
    const add = typed.replace(/\s/g, '').split('')
    if (!add.length) chars[i] = ''
    add.forEach((ch, k) => { if (i + k < n) chars[i + k] = ch })
    p.set(chars.join('') || null)
    boxes.current[Math.min(i + add.length, n - 1)]?.focus()
  }
  return h('div', { role: 'group', 'aria-label': p.label, className: 'fw-otp' },
    Array.from({ length: n }, (_, i) => h('input', {
      key: i, ref: (el: HTMLInputElement | null) => { boxes.current[i] = el },
      ...(i === 0 ? aria(p) : { className: p.className, 'aria-invalid': p.error ? true : undefined }),
      'aria-label': `${p.label} ${i + 1}`, inputMode: 'numeric', autoComplete: i === 0 ? 'one-time-code' : 'off',
      readOnly: p.readOnly, value: v[i] ?? '', onBlur: p.touch,
      onChange: (e: ChangeEvent<HTMLInputElement>) => put(i, e.target.value.length === 2 && v[i] ? e.target.value.replace(v[i], '') : e.target.value),
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Backspace' && !v[i] && i > 0) boxes.current[i - 1]?.focus() },
      onFocus: (e: FocusEvent<HTMLInputElement>) => e.target.select(),
    })))
}
