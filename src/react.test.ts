import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { Form, type WidgetProps } from './react.ts'
import type { FormSchema } from './schema.ts'

const schema: FormSchema = {
  version: 1,
  fields: {
    name: { type: 'string', label: { en: 'Name', hi: 'नाम' }, required: true, help: 'As on your ID' },
    employment: { type: 'choice', widget: 'radio', options: ['Salaried', 'Self Employed'] },
    business: { type: 'string', visible: "employment == 'Self Employed'" },
    agree: { type: 'boolean', widget: 'toggle' },
    items: { type: 'list', widget: 'table', min: 1, fields: { qty: { type: 'number' }, price: { type: 'number' } } },
    sign: { type: 'string', widget: 'signature' },
  },
  layout: [
    { type: 'pages', display: 'steps', children: [
      { type: 'section', title: 'You', children: [{ type: 'grid', cols: 2, children: ['name', 'employment', 'business'] }] },
      { type: 'section', title: 'Order', children: ['agree', 'items', 'sign'] },
    ] },
  ],
}

test('renders the first step with labels tied to inputs, in the chosen language', () => {
  const html = renderToString(h(Form, { schema, locale: 'hi' }))
  assert.match(html, /<ol class="fw-steps">.*aria-current="step"[^>]*>You</)
  const id = /<label for="([^"]+name)">नाम/.exec(html)?.[1]
  assert.ok(id, 'label for name')
  assert.match(html, new RegExp(`id="${id}"[^>]*aria-describedby="${id}-help"[^>]*aria-required="true"`))
  assert.match(html, /role="radiogroup"/)
  assert.doesNotMatch(html, /business/i) // hidden by its condition
  assert.doesNotMatch(html, /Order<\/h3>|fw-table/) // second step not shown yet
  assert.match(html, />Next</)
})

test('your own widget replaces one by name, and errors wait for a touch', () => {
  const Signature = (p: WidgetProps) => h('canvas', { id: p.id, 'data-required': p.required })
  const one: FormSchema = { version: 1, fields: { sign: { type: 'string', widget: 'signature', required: true }, items: schema.fields.items } }
  const html = renderToString(h(Form, { schema: one, widgets: { signature: Signature } }))
  assert.match(html, /<canvas id="[^"]+sign" data-required="true">/)
  assert.doesNotMatch(html, /fw-error/)
  assert.match(html, /<table class="fw-table">/)
  assert.match(html, /\+ Add row/)
})
