// Text inputs: plain, long, password, search, email, URL, card, IBAN, country, colour, code and JSON.
import { createElement as h, type ChangeEvent, type KeyboardEvent } from 'react'
import { COUNTRIES, countryName } from '../../core/countries.ts'
import { text } from '../../core/form.ts'
import type { StringField } from '../../core/schema.ts'
import { cx, type WidgetProps } from '../context.ts'
import { aria, textValue } from '../shell.ts'
import { Barcode } from './barcode.ts'
import { Location } from './location.ts'
import { Otp } from './otp.ts'
import { Phone } from './phone.ts'
import { RichText } from './rich-text.ts'
import { Signature } from './signature.ts'

export function StringInput(p: WidgetProps) {
  const f = p.field as StringField
  const attrs = {
    ...aria(p),
    readOnly: p.readOnly,
    value: textValue(p.value),
    maxLength: f.maxLength,
    minLength: f.minLength,
    placeholder: text(f.placeholder, p.locale) || undefined,
    onBlur: p.touch,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => p.set(e.target.value),
  }
  if (f.widget === 'textarea') return h('textarea', { ...attrs, rows: 4 })
  if (f.widget === 'code' || f.widget === 'json' || f.widget === 'markdown' || f.format === 'json')
    return h('textarea', {
      ...attrs,
      rows: 8,
      spellCheck: f.widget === 'markdown',
      className: cx('fw-code', p.className),
      onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== 'Tab' || e.shiftKey || f.widget === 'markdown') return // Esc then Tab still leaves: see the help text
        e.preventDefault()
        const t = e.currentTarget
        t.setRangeText('  ', t.selectionStart, t.selectionEnd, 'end')
        p.set(t.value)
      },
    })
  if (f.widget === 'phone') return h(Phone, p)
  if (f.widget === 'richtext') return h(RichText, p)
  if (f.widget === 'map') return h(Location, p)
  if (f.widget === 'barcode') return h(Barcode, p)
  if (f.format === 'country')
    return h(
      'select',
      { ...attrs, onChange: (e: ChangeEvent<HTMLSelectElement>) => p.set(e.target.value || null) },
      h('option', { value: '' }, text(f.placeholder, p.locale) || '—'),
      COUNTRIES.map((k) => [k, countryName(k, p.locale)])
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([k, name]) => h('option', { key: k, value: k }, name)),
    )
  if (f.format === 'card')
    return h('input', {
      ...attrs,
      type: 'text',
      inputMode: 'numeric',
      autoComplete: 'cc-number',
      value: textValue(p.value).replace(/(\d{4})(?=\d)/g, '$1 '),
      onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.value.replace(/\D/g, '') || null),
    })
  if (f.format === 'iban')
    return h('input', {
      ...attrs,
      type: 'text',
      autoComplete: 'off',
      value: textValue(p.value).replace(/(.{4})(?=.)/g, '$1 '),
      onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.value.replace(/\s/g, '').toUpperCase() || null),
    })
  if (f.widget === 'otp') return h(Otp, p)
  if (f.widget === 'signature') return h(Signature, p)
  if (f.widget === 'location') return h(Location, p)
  if (f.format === 'color') return h('input', { ...attrs, type: 'color', value: textValue(p.value) || '#000000', className: cx('fw-color', p.className) })
  const type =
    f.widget === 'password'
      ? 'password'
      : f.widget === 'search'
        ? 'search'
        : f.format === 'email'
          ? 'email'
          : f.format === 'url'
            ? 'url'
            : f.format === 'phone'
              ? 'tel'
              : 'text'
  return h('input', { ...attrs, type, autoComplete: f.widget === 'password' ? 'off' : undefined })
}
