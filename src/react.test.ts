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
  assert.match(html, /data-position="top"><ol class="fw-steps"><li data-state="current" aria-current="step"><span class="fw-step"><span class="fw-step-n" aria-hidden="true">1<\/span><span class="fw-step-t">You</)
  assert.match(html, /data-state="next"[^>]*><span class="fw-step">.*Order</) // a later step isn't a button: Next checks this one first
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

test('your own classes go on the form, its parts, a field and a layout node', () => {
  const one: FormSchema = { version: 1, fields: { name: { type: 'string', className: 'wide' }, ok: { type: 'boolean' } }, layout: [{ type: 'section', className: 'card', children: ['name', 'ok'] }] }
  const html = renderToString(h(Form, { schema: one, className: 'mine', classes: { field: 'mb-3', label: 'form-label', input: 'form-control', submit: 'btn btn-primary' } }))
  assert.match(html, /<form class="fw-form mine"/)
  assert.match(html, /<section class="fw-section card"/)
  assert.match(html, /class="fw-field mb-3 wide"><label for="[^"]+" class="form-label">/)
  assert.match(html, /<input id="[^"]+name" class="form-control"/)
  assert.doesNotMatch(html, /type="checkbox"[^>]*form-control|form-control[^>]*type="checkbox"/) // a checkbox isn't a text box
  assert.match(html, /class="fw-submit btn btn-primary"/)
})

test('tabs are a real tab list: one in the tab order, each tied to the panel', () => {
  const tabs: FormSchema = { ...schema, layout: [{ ...(schema.layout![0] as object), display: 'tabs' } as never] }
  const html = renderToString(h(Form, { schema: tabs }))
  assert.match(html, /role="tab" aria-selected="true" aria-controls="([^"]+)panel" tabindex="0">You/)
  assert.match(html, /role="tab" aria-selected="false" aria-controls="[^"]+panel" tabindex="-1">Order/)
  assert.match(html, /id="[^"]+panel" role="tabpanel" aria-labelledby="[^"]+tab0"/)
})
