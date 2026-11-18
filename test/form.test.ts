import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createForm, lint, text, toJsonSchema, validate, type FormSchema } from '../src/index.ts'

const loan: FormSchema = {
  version: 1,
  fields: {
    name: { type: 'string', required: true, minLength: 2 },
    email: { type: 'string', format: 'email' },
    site: { type: 'string', format: 'url' },
    employment: { type: 'choice', options: ['Salaried', 'Self Employed'], required: true },
    business: { type: 'string', visible: "employment == 'Self Employed'", required: true },
    start: { type: 'date', min: '2020-01-01' },
    end: { type: 'date', check: 'end >= start', messages: { check: 'End is before start' } },
    items: {
      type: 'list',
      min: 1,
      fields: {
        qty: { type: 'number', min: 1, decimals: 0, required: true },
        price: { type: 'number', format: 'currency', decimals: 2 },
        total: { type: 'number', value: 'qty * price', decimals: 2 },
      },
    },
    grandTotal: { type: 'number', value: 'sum(items.total) + gst', decimals: 2 }, // listed before the gst it reads
    gst: { type: 'number', value: 'sum(items.total) * 18 / 100', decimals: 2 },
    pan: { type: 'string', validators: ['pan'] },
  },
}
const validators = { pan: (v: unknown) => (/^[A-Z]{5}\d{4}[A-Z]$/.test(String(v)) ? undefined : 'Invalid PAN') }
const codes = (errors: Record<string, { code: string }>) => Object.fromEntries(Object.entries(errors).map(([k, e]) => [k, e.code]))

test('a hidden field is not required and is left out', () => {
  const r = validate(loan, { name: 'Asha', employment: 'Salaried', business: 'left over', items: [{ qty: 2, price: 10 }] }, { validators })
  assert.equal(r.ok, true)
  assert.equal('business' in r.values, false)
})

test('a condition makes a field required', () => {
  const r = validate(loan, { name: 'Asha', employment: 'Self Employed', items: [{ qty: 1 }] }, { validators })
  assert.deepEqual(r.errors.business, { code: 'required', message: 'Required' })
})

test('formulas run in rows and over them, rounded; what the client sent for them is ignored', () => {
  const r = validate(
    loan,
    {
      name: 'Asha',
      employment: 'Salaried',
      items: [
        { qty: '3', price: '0.1', total: 999 },
        { qty: 2, price: 10.25 },
      ],
      gst: 1,
    },
    { validators },
  )
  assert.deepEqual(r.values.items, [
    { qty: 3, price: 0.1, total: 0.3 },
    { qty: 2, price: 10.25, total: 20.5 },
  ])
  assert.equal(r.values.gst, 3.74)
  assert.equal(r.values.grandTotal, 24.54)
})

test('values are checked by type, format and rule', () => {
  const r = validate(
    loan,
    { name: 'A', email: 'nope', site: 'javascript:alert(1)', employment: 'Retired', start: '2019-12-31', end: '2019-01-01', items: [{ qty: 1.5 }], pan: 'abc' },
    { validators },
  )
  assert.deepEqual(codes(r.errors), {
    name: 'minLength',
    email: 'format',
    site: 'format',
    employment: 'option',
    start: 'min',
    end: 'check',
    'items.0.qty': 'decimals',
    pan: 'pan',
  })
  assert.equal(r.errors.end.message, 'End is before start')
  assert.equal(r.errors.start.message, 'Not before 2020-01-01')
  assert.equal(validate(loan, { start: '2026-02-30' }, { validators }).errors.start.code, 'type')
  assert.equal(validate(loan, { name: false }, { validators }).errors.name.code, 'type')
})

test('only the schema keys come through', () => {
  const input = JSON.parse('{"__proto__": {"polluted": true}, "name": "Asha", "employment": "Salaried", "items": [{"qty": 1}], "extra": 1}')
  const r = validate(loan, input, { validators })
  assert.equal(({} as any).polluted, undefined)
  assert.equal('extra' in r.values, false)
  assert.equal(Object.getPrototypeOf(r.values), Object.prototype)
})

test('a hidden section hides its fields', () => {
  const s: FormSchema = {
    version: 1,
    fields: { kind: { type: 'choice', options: ['a', 'b'] }, x: { type: 'string', required: true } },
    layout: ['kind', { type: 'section', visible: "kind == 'b'", children: ['x'] }],
  }
  assert.equal(validate(s, { kind: 'a' }).ok, true)
  assert.equal(validate(s, { kind: 'b' }).errors.x?.code, 'required')
})

test('words per locale', () => {
  assert.equal(text({ en: 'Name', hi: 'नाम' }, 'hi-IN'), 'नाम')
  const s: FormSchema = { version: 1, fields: { n: { type: 'string', required: true, messages: { required: { en: 'Tell us', hi: 'बताइए' } } } } }
  assert.equal(validate(s, {}, { locale: 'hi' }).errors.n.message, 'बताइए')
})

test('lint finds what would break', () => {
  const issues = lint({
    version: 1,
    fields: {
      'bad key': { type: 'string' },
      a: { type: 'number', value: 'b + 1' },
      b: { type: 'number', value: 'a * 2' },
      c: { type: 'string', visible: 'missing == 1', pattern: '(' },
      d: { type: 'number', value: 'nope(1)' },
    },
    layout: ['a', 'a', 'zzz'],
  })
  assert.deepEqual(
    issues.map((i) => i.path),
    ['bad key', 'c.visible', 'c.pattern', 'd.value', 'a', 'layout.1', 'layout.2'],
  )
  assert.match(issues[4].message, /a → b → a/)
  assert.throws(() => createForm({ version: 1, fields: { a: { type: 'nope' } } } as any), /Unknown type "nope"/)
})

test('the form store recomputes, keeps hidden answers, and tells subscribers', () => {
  const form = createForm(loan, { validators })
  const v = () => form.getState().values as any
  let calls = 0
  form.subscribe(() => calls++)
  assert.equal(v().items.length, 1) // min: 1
  form.set('items.0.qty', '4')
  form.set('items.0.price', 2.5)
  assert.equal(v().items[0].total, 10)
  assert.equal(v().grandTotal, 11.8)
  form.addRow('items')
  form.set('items.1.qty', 1)
  form.set('items.1.price', 1)
  form.removeRow('items', 0)
  assert.deepEqual(v().items, [{ qty: 1, price: 1, total: 1 }])
  form.set('employment', 'Self Employed')
  form.set('business', 'Shop')
  form.set('employment', 'Salaried')
  assert.equal(v().business, 'Shop') // kept while hidden…
  assert.equal(form.getState().fields.business.visible, false)
  assert.equal('business' in form.submit().values, false) // …but not submitted
  assert.throws(() => form.set('items.5.qty', 1), /Unknown field/)
  assert.throws(() => form.set('__proto__', 1), /Unknown field/)
  assert.ok(calls >= 10)
})

test('fixed rows: exactly one row each, never added or removed, in order', () => {
  const s: FormSchema = {
    version: 1,
    fields: { week: { type: 'list', widget: 'table', rows: ['Mon', 'Tue', 'Wed'], rowHeading: 'Day', fields: { hours: { type: 'number', required: true } } } },
  }
  assert.deepEqual(lint(s), [])
  const f = createForm(s)
  assert.equal((f.getState().values.week as unknown[]).length, 3)
  f.addRow('week')
  assert.equal((f.getState().values.week as unknown[]).length, 3)
  const short = validate(s, { week: [{ hours: 8 }] })
  assert.equal(short.errors.week?.code, 'minItems')
  assert.ok(validate(s, { week: [{ hours: 8 }, { hours: 7 }, { hours: 6 }] }).ok)
  assert.equal(toJsonSchema(s).properties.week.minItems, 3)
  assert.ok(lint({ version: 1, fields: { t: { type: 'list', rows: [] as string[], fields: { a: { type: 'string' } } } } }).length)
})

test('a drawn signature may be longer than typed text; a colour is #rrggbb', () => {
  const s: FormSchema = { version: 1, fields: { sign: { type: 'string', widget: 'signature' }, c: { type: 'string', format: 'color' } } }
  assert.ok(validate(s, { sign: 'x'.repeat(20_000), c: '#12abEF' }).ok)
  assert.equal(validate(s, { c: 'red' }).errors.c?.code, 'format')
})

test('cascading options, other answers, and the card / IBAN / country / JSON checks', () => {
  const s: FormSchema = {
    version: 1,
    fields: {
      state: { type: 'choice', options: ['MH', 'KA'] },
      city: {
        type: 'choice',
        options: [
          { value: 'Pune', visible: "state == 'MH'" },
          { value: 'Mysuru', visible: "state == 'KA'" },
        ],
      },
      tags: { type: 'choice', multiple: true, allowOther: true, options: ['a'] },
      card: { type: 'string', format: 'card' },
      iban: { type: 'string', format: 'iban' },
      country: { type: 'string', format: 'country' },
      json: { type: 'string', format: 'json' },
    },
  }
  assert.deepEqual(lint(s), [])
  assert.equal(validate(s, { state: 'KA', city: 'Pune' }).errors.city?.code, 'option')
  assert.ok(validate(s, { state: 'MH', city: 'Pune', tags: ['a', 'mine'] }).ok)
  const f = createForm(s, { values: { state: 'KA' } })
  assert.deepEqual(f.getState().fields.city.options, ['Mysuru'])
  assert.ok(validate(s, { card: '4111111111111111', iban: 'GB82WEST12345698765432', country: 'IN', json: '{"a":1}' }).ok)
  const bad = validate(s, { card: '4111111111111112', iban: 'GB82WEST12345698765433', country: 'ZZ', json: '{a:1}' }).errors
  assert.deepEqual([bad.card?.code, bad.iban?.code, bad.country?.code, bad.json?.code], ['format', 'format', 'format', 'format'])
})
