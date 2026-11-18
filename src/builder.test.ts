import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { Builder, edits, fieldAt, freeKey } from './builder.ts'
import { lint } from './lint.ts'
import type { FormSchema } from './schema.ts'

const base: FormSchema = {
  version: 1,
  fields: {
    name: { type: 'string' },
    items: { type: 'list', fields: { qty: { type: 'number' }, price: { type: 'number' } } },
  },
  layout: [{ type: 'section', children: ['name', 'items'] }],
}

test('edits keep order, nesting and the layout in step', () => {
  let s = edits.add(base, ['items'], 'total', { type: 'number', value: 'qty * price' }, 'price')
  assert.deepEqual(Object.keys((fieldAt(s.fields, ['items']) as any).fields), ['qty', 'price', 'total'])
  s = edits.rename(s, ['name'], 'fullName')
  assert.deepEqual(Object.keys(s.fields), ['fullName', 'items'])
  assert.deepEqual((s.layout![0] as any).children, ['fullName', 'items'])
  s = edits.move(s, ['items'], 'fullName')
  assert.deepEqual(Object.keys(s.fields), ['items', 'fullName'])
  s = edits.remove(s, ['fullName'])
  assert.deepEqual((s.layout![0] as any).children, ['items'])
  assert.deepEqual(lint(s), [])
  assert.equal(base.fields.name.type, 'string') // the original is untouched
  assert.equal(freeKey(s.fields, ['items'], 'qty'), 'qty1')
})

test('opens on the design canvas: the form itself, every part marked so a click can pick it', () => {
  const html = renderToString(h(Builder, { schema: { ...base, fields: { ...base.fields, items: { ...base.fields.items, widget: 'table', min: 1 } as any, secret: { type: 'string', visible: 'name == \'x\'' } }, layout: [{ type: 'section', title: 'You', children: ['name', 'items', 'secret'] }] } }))
  assert.match(html, /<section class="fw-section" data-fw-ip="0" draggable="true"><h3>You<\/h3>/)
  assert.match(html, /class="fw-field" data-fw-path="name" draggable="true"/)
  assert.match(html, /<th data-fw-path="items.qty">/) // a column, picked from its heading
  assert.match(html, /data-fw-path="items.qty" draggable="true"/) // and from its cells, which name the column, not the row
  assert.match(html, /data-fw-path="secret" data-fw-hidden="true"/) // hidden by its condition, still shown here
  assert.match(html, /Form settings/)
  assert.match(html, /<button type="button" aria-pressed="true" title="1024px wide">Desktop<\/button>/) // also Tablet and Phone widths
  assert.match(html, /class="fw-b-device" data-device="desktop" style="width:1024px;zoom:1"/)
  assert.match(html, /<summary>Layout<small> 10<\/small>/) // sections and steps come from the same palette
})

test('relocate moves a field\'s place in the layout, ipOf finds it', async () => {
  const { relocate, ipOf } = await import('./builder.ts')
  const s: FormSchema = { version: 1, fields: { a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } }, layout: ['a', { type: 'section', children: ['b'] }, 'c'] }
  assert.deepEqual(ipOf(s.layout!, 'b'), [1, 0])
  const t = relocate(s, 'c', [1], 0) // into the section, before b
  assert.deepEqual(t.layout, ['a', { type: 'section', children: ['c', 'b'] }])
  assert.deepEqual(relocate(t, 'a', [], 2).layout, [{ type: 'section', children: ['c', 'b'] }, 'a'])
})

test('the palette is an accordion, one group open at a time, Text first', () => {
  const html = renderToString(h(Builder, { schema: base }))
  assert.match(html, /<details class="fw-b-group" open="" name="fw-palette"><summary>Text<small> 8<\/small><\/summary>/)
  assert.match(html, /<summary>Choices.*?\+ <!-- -->Radio group/)
  assert.match(html, /\+ <!-- -->Checkbox group/)
})

test('layout edits move nodes between containers and keep pages to sections', async () => {
  const { layoutEdits, nodeAt } = await import('./builder.ts')
  const items: any[] = ['a', { type: 'section', children: ['b'] }, { type: 'pages', children: [{ type: 'section', children: [] }] }, 'c']
  // 'a' into the section, at its end
  let l: any[] = layoutEdits.move(items, [0], [1], 1)!
  assert.deepEqual(l[0].children, ['b', 'a'])
  // 'c' to the top, before everything (it shifts nothing else)
  l = layoutEdits.move(l, [2], [], 0)!
  assert.deepEqual(l.map((n: any) => (typeof n === 'string' ? n : n.type)), ['c', 'section', 'pages'])
  // a field can't sit directly in pages; a section can't go into itself
  assert.equal(layoutEdits.move(l, [0], [2], 0), undefined)
  assert.equal(layoutEdits.move(l, [1], [1], 0), undefined)
  // the section moves into pages as a second page
  l = layoutEdits.move(l, [1], [2], 1)!
  assert.equal((nodeAt(l, [1]) as any).children.length, 2)
  // removing a container keeps what was in it
  assert.deepEqual(layoutEdits.unwrap(l, [1]), ['c', { type: 'section', children: [] }, { type: 'section', children: ['b', 'a'] }])
})

test('lint: totals name number columns', () => {
  const s = (totals: unknown) => ({ version: 1, fields: { t: { type: 'list', totals, fields: { qty: { type: 'number' }, name: { type: 'string' } } } } })
  assert.deepEqual(lint(s(['qty'])), [])
  assert.deepEqual(lint(s(['name'])).map((i) => i.path), ['t.totals'])
  assert.deepEqual(lint(s(['nope'])).map((i) => i.path), ['t.totals'])
})

test('lint: section looks, content kinds and the theme', () => {
  const s = (extra: object, layout: unknown[] = []) => ({ version: 1, fields: {}, layout, ...extra })
  assert.deepEqual(lint(s({ theme: 'paper' }, [{ type: 'section', look: 'band', children: [] }, { type: 'content', as: 'rich', text: '<b>x</b>' }])), [])
  assert.deepEqual(lint(s({ theme: 'neon' }, [{ type: 'section', look: 'bold', children: [] }, { type: 'content', as: 'html' }])).map((i) => i.path), ['theme', 'layout.0.look', 'layout.1.as'])
})

test('lint: options per row is a whole number from 1 to 12', () => {
  const s = (columns: unknown) => ({ version: 1, fields: { c: { type: 'choice', options: ['a', 'b'], columns } } })
  assert.deepEqual(lint(s(3)), [])
  assert.deepEqual(lint(s(0)).map((i) => i.path), ['c.columns'])
  assert.deepEqual(lint(s(2.5)).map((i) => i.path), ['c.columns'])
})

test('lint: images are https or inline png/jpeg/gif/webp; grid widths are positive numbers', () => {
  const s = (n: object) => ({ version: 1, fields: {}, layout: [n] })
  assert.deepEqual(lint(s({ type: 'content', as: 'image', src: 'https://example.com/a.png' })), [])
  assert.deepEqual(lint(s({ type: 'content', as: 'image', src: 'data:image/webp;base64,AAAA' })), [])
  for (const bad of ['javascript:alert(1)', 'http://x/a.png', 'data:image/svg+xml;base64,AAAA', 'https://x/a.png" onerror="x'])
    assert.deepEqual(lint(s({ type: 'content', as: 'image', src: bad })).map((i) => i.path), ['layout.0.src'], bad)
  assert.deepEqual(lint(s({ type: 'grid', widths: [1, 3], look: 'lines', children: [] })), [])
  assert.deepEqual(lint(s({ type: 'grid', widths: [0], look: 'box', children: [] })).map((i) => i.path), ['layout.0.widths', 'layout.0.look'])
})

test('copy and paste: keys made unique, formulas and the layout follow them', async () => {
  const { copyPart, pasteClip, renameRefs } = await import('./builder.ts')
  assert.equal(renameRefs("qty * price + sum(items.total) and name == 'qty'", { qty: 'qty1', price: 'price1', items: 'items1', total: 'x' }), "qty1 * price1 + sum(items1.total) and name == 'qty'")
  const s: FormSchema = { version: 1, fields: { qty: { type: 'number' }, price: { type: 'number' }, total: { type: 'number', value: 'qty * price' }, note: { type: 'string' } },
    layout: [{ type: 'section', title: 'Order', visible: 'qty > 0', children: [{ type: 'grid', cols: 2, children: ['qty', 'price'] }, 'total'] }, 'note'] }
  // a section, with the fields in it, pasted after itself
  const r = pasteClip(s, copyPart(s, { ip: [0] })!, [], undefined, [[], 1])
  assert.deepEqual(r.keys, ['qty1', 'price1', 'total1'])
  assert.deepEqual(r.placed, [1])
  assert.equal((r.schema.fields.total1 as any).value, 'qty1 * price1')
  assert.deepEqual(r.schema.layout![1], { type: 'section', title: 'Order', visible: 'qty1 > 0', children: [{ type: 'grid', cols: 2, children: ['qty1', 'price1'] }, 'total1'] })
  assert.deepEqual(lint(r.schema), [])
  // one field: after the original, its key free
  const f = pasteClip(r.schema, copyPart(r.schema, { path: ['note'] })!, [], 'note', [[], 3])
  const keys = Object.keys(f.schema.fields)
  assert.equal(keys.indexOf('note1'), keys.indexOf('note') + 1)
  assert.deepEqual(f.schema.layout!.slice(2), ['note', 'note1'])
  assert.deepEqual(lint(f.schema), [])
  // the whole form into another: everything comes, nothing clashes
  const all = pasteClip(s, copyPart(s, 'all')!)
  assert.equal(Object.keys(all.schema.fields).length, 8)
  assert.deepEqual(lint(all.schema), [])
  // a column of a table stays in the table
  const t: FormSchema = { version: 1, fields: { items: { type: 'list', fields: { qty: { type: 'number' } } } } }
  const col = pasteClip(t, copyPart(t, { path: ['items', 'qty'] })!, ['items'], 'qty')
  assert.deepEqual(Object.keys((col.schema.fields.items as any).fields), ['qty', 'qty1'])
})
