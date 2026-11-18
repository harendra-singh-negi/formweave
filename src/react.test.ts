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

test('a list shows each row as a card; a table numbers its rows', () => {
  const rows = (widget?: string): FormSchema => ({ version: 1, fields: { items: { type: 'list', widget, min: 2, fields: { qty: { type: 'number' } } } } })
  const list = renderToString(h(Form, { schema: rows() }))
  assert.match(list, /class="fw-row"><div class="fw-row-head"><span>Row 1<\/span>/)
  assert.doesNotMatch(list, /<table/)
  const table = renderToString(h(Form, { schema: rows('table') }))
  assert.match(table, /<th class="fw-n">#<\/th>/)
  assert.match(table, /<td class="fw-n" data-label="Row">2<\/td>/) // a phone shows "Row 2" on the row's card
  assert.match(table, /<label for="[^"]+items\.1\.qty" class="fw-sr">Qty<\/label>/) // the heading a phone shows above the box
})

test('more inputs: fixed rows, OTP boxes, ₹ in front, stars, slider, autocomplete, hidden', () => {
  const s: FormSchema = { version: 1, fields: {
    week: { type: 'list', widget: 'table', rows: ['Mon', 'Tue'], rowHeading: 'Day', fields: { hours: { type: 'number' } } },
    otp: { type: 'string', widget: 'otp', maxLength: 4 },
    amount: { type: 'number', format: 'currency', currency: 'INR' },
    stars: { type: 'number', widget: 'rating', max: 5 },
    level: { type: 'number', widget: 'slider', min: 0, max: 10 },
    city: { type: 'choice', widget: 'autocomplete', options: ['Delhi', 'Pune'] },
    secret: { type: 'string', widget: 'hidden', default: 'abc' },
    sign: { type: 'string', widget: 'signature' },
  } }
  const html = renderToString(h(Form, { schema: s }))
  assert.match(html, /<th class="fw-fixed">Day<\/th>/)
  assert.match(html, /<th scope="row" class="fw-fixed">Tue<\/th>/)
  assert.doesNotMatch(html, /Add row/) // fixed rows can't grow
  assert.equal(html.match(/aria-label="Otp \d"/g)?.length, 4)
  assert.match(html, /<div class="fw-affix"><span aria-hidden="true">₹<\/span><input/)
  assert.equal(html.match(/★/g)?.length, 5)
  assert.match(html, /type="range" min="0" max="10"/)
  assert.match(html, /<datalist id="[^"]+city-list"><option value="Delhi">/)
  assert.doesNotMatch(html, /secret/i)
  assert.match(html, /<svg id="[^"]+sign" role="img"/)
})

test('button groups, tags, phone with country code, country, stepper and cascading options render', () => {
  const s: FormSchema = { version: 1, fields: {
    yes: { type: 'choice', widget: 'buttons', options: ['Yes', 'No'] },
    tags: { type: 'choice', widget: 'tags', multiple: true, allowOther: true, options: ['a'], default: ['a', 'mine'] },
    phone: { type: 'string', widget: 'phone', format: 'phone', country: 'IN' },
    country: { type: 'string', format: 'country' },
    qty: { type: 'number', widget: 'stepper', min: 0 },
    state: { type: 'choice', options: ['MH', 'KA'], default: 'KA' },
    city: { type: 'choice', widget: 'radio', options: [{ value: 'Pune', visible: "state == 'MH'" }, { value: 'Mysuru', visible: "state == 'KA'" }] },
  } }
  const html = renderToString(h(Form, { schema: s, locale: 'hi' }))
  assert.match(html, /class="fw-buttons" role="radiogroup" aria-label="Yes"/)
  assert.match(html, /class="fw-tag">mine/)
  assert.match(html, /<option value="IN" selected="">भारत \(\+91\)<\/option>/)
  assert.match(html, /aria-label="− Qty"/)
  assert.match(html, /Mysuru/)
  assert.doesNotMatch(html, /Pune/) // only the cities of the picked state
})

test('a table without a label has no title; rich text and a map render', () => {
  const s: FormSchema = { version: 1, fields: {
    list1: { type: 'list', widget: 'table', min: 1, fields: { n: { type: 'number', label: 'S No.' } } },
    about: { type: 'string', widget: 'richtext' },
    where: { type: 'string', widget: 'map', default: '28.6139,77.209' },
  } }
  const html = renderToString(h(Form, { schema: s }))
  assert.doesNotMatch(html, /<legend/)
  assert.match(html, /<fieldset class="fw-field fw-list" aria-label="List1">/)
  assert.match(html, /role="toolbar" aria-label="About: formatting"/)
  assert.match(html, /contentEditable="true"[^>]*role="textbox"/)
  assert.match(html, /tile\.openstreetmap\.org\/14\/\d+\/\d+\.png/)
  assert.match(html, /class="fw-map-pin"/)
})

test('a matrix: a row per statement, a radio per option, the other fields as columns; a table sums its ticked columns', () => {
  const s: FormSchema = { version: 1, fields: {
    rate: { type: 'list', widget: 'matrix', rows: ['Quality', 'Speed'], rowHeading: 'Aspect', fields: {
      score: { type: 'choice', options: ['Poor', { value: 'ok', label: 'Fine' }], required: true },
      note: { type: 'string', label: 'Note' },
    }, default: [{ score: 'ok' }] },
    items: { type: 'list', widget: 'table', totals: ['qty'], default: [{ qty: 2, price: 5 }, { qty: 3 }], fields: { qty: { type: 'number' }, price: { type: 'number', format: 'currency', currency: 'INR' } } },
  } }
  const html = renderToString(h(Form, { schema: s }))
  assert.match(html, /<table class="fw-table fw-matrix"><thead><tr><th class="fw-fixed">Aspect<\/th><th class="fw-m-opt">Poor<\/th><th class="fw-m-opt">Fine<\/th><th>Note<\/th>/)
  assert.match(html, /<th scope="row" class="fw-fixed">Quality<\/th><td class="fw-m-opt" data-label="Poor"><input type="radio" aria-label="Quality: Poor" name="[^"]+rate\.0\.score" value="Poor"\/>/)
  assert.match(html, /aria-label="Quality: Fine" name="[^"]+" checked="" value="ok"/)
  assert.doesNotMatch(html, /fw-error/) // untouched, so no error yet
  assert.match(html, /<tfoot><tr><th scope="row" class="fw-n">Total<\/th><td class="fw-total" data-label="Qty">5<\/td><td><\/td>/)
})

test('paper prints the title on top; sections take a look; rich text shows its words without a DOM', () => {
  const s: FormSchema = { version: 1, title: 'Boat drill', theme: 'paper', fields: { name: { type: 'string' } }, layout: [
    { type: 'content', as: 'rich', text: '<p><strong>Note:</strong> use <em>capitals</em> &amp; ink.</p><script>alert(1)</script>' },
    { type: 'section', title: 'Crew', look: 'band', children: ['name'] },
  ] }
  const html = renderToString(h(Form, { schema: s }))
  assert.match(html, /<form class="fw-form fw-theme-paper" noValidate=""><h2 class="fw-title">Boat drill<\/h2>/)
  assert.match(html, /<div class="fw-content fw-rich-block">Note: use capitals &amp;amp; ink. alert\(1\)<\/div>/) // escaped by React: no tag gets through
  assert.match(html, /<section class="fw-section fw-look-band"><h3>Crew<\/h3>/)
  assert.doesNotMatch(renderToString(h(Form, { schema: { ...s, theme: undefined } })), /fw-title|fw-theme/) // without paper the app shows the title
})

test('options break into the columns asked for', () => {
  const s: FormSchema = { version: 1, fields: { ops: { type: 'choice', multiple: true, columns: 3, options: ['A', 'B', 'C', 'D'] }, one: { type: 'choice', widget: 'radio', options: ['x', 'y'] } } }
  const html = renderToString(h(Form, { schema: s }))
  assert.match(html, /class="fw-options fw-options-cols" role="group" aria-label="Ops" style="--fw-opt-cols:3"/)
  assert.match(html, /class="fw-options" role="radiogroup" aria-label="One">/) // without columns they run on in a line
})
