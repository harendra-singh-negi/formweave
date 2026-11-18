// Choices: radios, tick boxes, a dropdown, buttons, autocomplete and tags, in columns when asked.
import { createElement as h, Fragment, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent } from 'react'
import { text } from '../../core/form.ts'
import type { ChoiceField } from '../../core/schema.ts'
import { useCtx, type WidgetProps } from '../context.ts'
import { aria, textValue } from '../shell.ts'

export function ChoiceInput(p: WidgetProps) {
  const f = p.field as ChoiceField
  const offered = useCtx().state.fields[p.path]?.options // cascading: only the options whose condition holds
  const opts = f.options
    .map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: text(o.label, p.locale) || o.value }))
    .filter((o) => !offered || offered.includes(o.value))
  if (f.widget === 'tags') return h(Tags, { ...p, opts })
  if (f.widget === 'buttons') {
    const picked = f.multiple ? (Array.isArray(p.value) ? (p.value as string[]) : []) : [p.value]
    return h(
      'div',
      { ...aria(p), role: f.multiple ? 'group' : 'radiogroup', 'aria-label': p.label, className: 'fw-buttons' },
      opts.map((o) =>
        h(
          'label',
          { key: o.value },
          h('input', {
            type: f.multiple ? 'checkbox' : 'radio',
            name: p.id,
            className: 'fw-sr',
            disabled: p.readOnly,
            checked: picked.includes(o.value),
            onBlur: p.touch,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              p.set(!f.multiple ? o.value : e.target.checked ? [...picked, o.value] : picked.filter((x) => x !== o.value)),
          }),
          h('span', null, o.label),
        ),
      ),
    )
  }
  // as many columns as the paper had
  const grid = f.columns ? { className: 'fw-options fw-options-cols', style: { '--fw-opt-cols': f.columns } as CSSProperties } : { className: 'fw-options' }
  if (f.multiple && f.widget !== 'select') {
    const picked = Array.isArray(p.value) ? (p.value as string[]) : []
    return h(
      'div',
      { ...aria(p), role: 'group', 'aria-label': p.label, ...grid },
      opts.map((o) =>
        h(
          'label',
          { key: o.value },
          h('input', {
            type: 'checkbox',
            disabled: p.readOnly,
            checked: picked.includes(o.value),
            onBlur: p.touch,
            onChange: (e: ChangeEvent<HTMLInputElement>) => p.set(e.target.checked ? [...picked, o.value] : picked.filter((x) => x !== o.value)),
          }),
          ' ',
          o.label,
        ),
      ),
    )
  }
  if (f.widget === 'radio')
    return h(
      'div',
      { ...aria(p), role: 'radiogroup', 'aria-label': p.label, ...grid },
      opts.map((o) =>
        h(
          'label',
          { key: o.value },
          h('input', { type: 'radio', name: p.id, disabled: p.readOnly, checked: p.value === o.value, onChange: () => p.set(o.value), onBlur: p.touch }),
          ' ',
          o.label,
        ),
      ),
    )
  if (f.widget === 'autocomplete' && !f.multiple) {
    const shown = opts.find((o) => o.value === p.value)?.label ?? textValue(p.value)
    return h(
      Fragment,
      null,
      h('input', {
        ...aria(p),
        type: 'text',
        list: `${p.id}-list`,
        autoComplete: 'off',
        readOnly: p.readOnly,
        value: shown,
        onBlur: p.touch,
        placeholder: text(f.placeholder, p.locale) || undefined,
        onChange: (e: ChangeEvent<HTMLInputElement>) => {
          const t = e.target.value
          const hit = opts.find((o) => o.label === t || o.value === t)
          p.set(hit ? hit.value : t || null)
        },
      }),
      h(
        'datalist',
        { id: `${p.id}-list` },
        opts.map((o) => h('option', { key: o.value, value: o.label })),
      ),
    )
  }
  if (f.multiple)
    return h(
      'select',
      {
        ...aria(p),
        multiple: true,
        disabled: p.readOnly,
        value: Array.isArray(p.value) ? (p.value as string[]) : [],
        onBlur: p.touch,
        onChange: (e: ChangeEvent<HTMLSelectElement>) => p.set(Array.from(e.target.selectedOptions, (o) => o.value)),
      },
      opts.map((o) => h('option', { key: o.value, value: o.value }, o.label)),
    )
  return h(
    'select',
    {
      ...aria(p),
      disabled: p.readOnly,
      value: textValue(p.value),
      onBlur: p.touch,
      onChange: (e: ChangeEvent<HTMLSelectElement>) => p.set(e.target.value),
    },
    h('option', { value: '' }, text(f.placeholder, p.locale) || '—'),
    opts.map((o) => h('option', { key: o.value, value: o.value }, o.label)),
  )
}

/** Picked or typed words shown as chips; Enter or a comma adds one, Backspace in an empty box takes the last off. */
export function Tags(p: WidgetProps & { opts: { value: string; label: string }[] }) {
  const c = useCtx()
  const [draft, setDraft] = useState('')
  const tags = Array.isArray(p.value) ? (p.value as string[]) : []
  const label = (v: string) => p.opts.find((o) => o.value === v)?.label ?? v
  const add = (t: string) => {
    const hit = p.opts.find((o) => o.label.toLowerCase() === t.trim().toLowerCase())
    const v = hit?.value ?? t.trim()
    if (v && !tags.includes(v)) p.set([...tags, v])
    setDraft('')
  }
  return h(
    'div',
    { className: 'fw-tags' },
    tags.map((t) =>
      h(
        'span',
        { key: t, className: 'fw-tag' },
        label(t),
        !p.readOnly && h('button', { type: 'button', 'aria-label': `${c.labels.remove} ${label(t)}`, onClick: () => p.set(tags.filter((x) => x !== t)) }, '×'),
      ),
    ),
    !p.readOnly &&
      h('input', {
        ...aria(p),
        type: 'text',
        list: `${p.id}-list`,
        value: draft,
        autoComplete: 'off',
        onBlur: () => {
          if (draft.trim()) add(draft)
          p.touch()
        },
        onChange: (e: ChangeEvent<HTMLInputElement>) => (e.target.value.endsWith(',') ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value)),
        onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter' && draft.trim()) {
            e.preventDefault()
            add(draft)
          } else if (e.key === 'Backspace' && !draft && tags.length) p.set(tags.slice(0, -1))
        },
      }),
    h(
      'datalist',
      { id: `${p.id}-list` },
      p.opts.filter((o) => !tags.includes(o.value)).map((o) => h('option', { key: o.value, value: o.label })),
    ),
  )
}
