import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanLabel, findShapes, readPage, toSketch } from '../src/scan/vision/index.js'
/** A white page to draw on. */
function page(width, height) {
  const g = { data: new Uint8Array(width * height).fill(255), width, height }
  const fill = (x0, y0, x1, y1, v = 0) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.data[y * width + x] = v
  }
  const frame = (x0, y0, x1, y1, t = 2) => {
    fill(x0, y0, x1, y0 + t)
    fill(x0, y1 - t, x1, y1)
    fill(x0, y0, x0 + t, y1)
    fill(x1 - t, y0, x1, y1)
  }
  return { g, fill, frame }
}
test('finds lines, dotted lines, tick boxes, boxes, tables and character boxes', () => {
  const { g, fill, frame } = page(1200, 900)
  for (let i = 0; i < 30; i++) fill(60 + i * 22, 40, 72 + i * 22, 54) // a line of "letters", 14 px tall
  fill(300, 114, 700, 116) // a line to write on
  for (let x = 100; x < 400; x += 8) fill(x, 200, x + 3, 203) // a dotted line
  frame(100, 300, 118, 318) // a tick box
  for (let a = 0; a < 360; a += 2) {
    // a ring, like the letter O: not a tick box
    const x = Math.round(209 + 9 * Math.cos((a * Math.PI) / 180))
    const y = Math.round(309 + 9 * Math.sin((a * Math.PI) / 180))
    fill(x, y, x + 2, y + 2)
  }
  frame(600, 300, 1000, 360) // a box to write in
  frame(100, 450, 600, 600) // a table: 3 columns, 3 rows
  fill(266, 450, 268, 600)
  fill(433, 450, 435, 600)
  fill(100, 500, 600, 502)
  fill(100, 550, 600, 552)
  frame(700, 450, 1000, 480) // ten boxes for one character each
  for (let i = 1; i < 10; i++) fill(700 + i * 30, 450, 702 + i * 30, 480)
  fill(700, 700, 800, 750) // a solid block: not a frame
  const s = findShapes(g)
  assert.ok(s.em >= 20 && s.em <= 28, `em ${s.em}`)
  const near = (r, x0, y0) => Math.abs(r.x0 - x0) <= 2 && Math.abs(r.y0 - y0) <= 2
  assert.equal(s.rules.length, 2)
  assert.ok(s.rules.some((r) => near(r, 300, 114) && r.x1 >= 698))
  assert.ok(s.rules.some((r) => near(r, 100, 200) && r.x1 >= 395))
  assert.equal(s.ticks.length, 1)
  assert.ok(near(s.ticks[0], 100, 300))
  assert.equal(s.frames.length, 3)
  const [box, table, comb] = [600, 100, 700].map((x) => s.frames.find((f) => near(f, x, f.y0)))
  assert.deepEqual([box.cols, box.rows], [[], []])
  assert.equal(table.cols.length, 2)
  assert.equal(table.rows.length, 2)
  assert.equal(comb.cols.length, 9)
  // shapes are cleared before OCR; the letters are not
  assert.equal(s.mask[115 * 1200 + 500], 1)
  assert.equal(s.mask[47 * 1200 + 65], 0)
})
const W = (text, x0, y0, x1, y1 = y0 + 20) => ({ text, confidence: 90, x0, y0, x1, y1 })
const R = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 })
test('pairs printed words with the shapes next to them', () => {
  const shapes = {
    width: 1200,
    height: 1600,
    em: 20,
    mask: new Uint8Array(0),
    rules: [
      R(170, 118, 500, 120), // after "Full name*:"
      R(600, 118, 900, 120), // after "Email:"
      R(200, 268, 250, 270),
      R(262, 268, 312, 270),
      R(324, 268, 400, 270), // __/__/____ after "Date of birth"
      R(50, 900, 300, 902), // above "Signature"
      R(150, 950, 700, 952),
      R(150, 990, 700, 992), // two lines after "Address:"
      R(40, 82, 400, 84), // under the heading: an underline
    ],
    ticks: [R(130, 160, 148, 178), R(210, 160, 228, 178), R(130, 210, 148, 228), R(210, 210, 228, 228), R(50, 820, 68, 838)],
    frames: [{ ...R(50, 400, 650, 600), cols: [250, 450], rows: [450, 500, 550] }],
  }
  const words = [
    W('1.', 40, 60, 55, 82),
    W('PERSONAL', 60, 60, 200, 82),
    W('DETAILS', 210, 60, 330, 82),
    W('Full', 50, 100, 90),
    W('name*:', 95, 100, 160),
    W('Email:', 520, 100, 590),
    W('Gender:', 50, 160, 120),
    W('Male', 155, 160, 200),
    W('Female', 235, 160, 300),
    W('Married?', 50, 210, 120),
    W('Yes', 155, 210, 190),
    W('No', 235, 210, 260),
    W('Date', 50, 250, 90),
    W('of', 95, 250, 110),
    W('birth', 115, 250, 160),
    W('/', 252, 252, 260),
    W('/', 314, 252, 322),
    W('Previous', 50, 370, 130),
    W('jobs', 135, 370, 180),
    W('Company', 60, 410, 140),
    W('From', 260, 410, 300),
    W('Salary', 460, 410, 520),
    W('I', 80, 820, 85),
    W('declare', 90, 820, 150),
    W('this', 155, 820, 190),
    W('is', 195, 820, 210),
    W('true', 215, 820, 250),
    W('Signature', 60, 906, 160),
    W('Address:', 50, 932, 130),
    W('~~', 900, 1500, 920, 1520), // OCR noise
    { ...W('~blur~', 900, 1400, 940), confidence: 10 },
  ]
  const items = readPage(shapes, words)
  const fields = items.flatMap((it) =>
    'field' in it ? [[it.field.label, it.field.kind, it.field.required, it.field.options.join('/')].join(' | ')] : [`# ${it.heading}`],
  )
  assert.deepEqual(fields, [
    '# PERSONAL DETAILS',
    'Full name | text | true | ',
    'Email | email | false | ',
    'Gender | one_of | false | Male/Female',
    'Married? | yes_no | false | ',
    'Date of birth | date | false | ',
    'Previous jobs | table | false | ',
    'I declare this is true | checkbox | false | ',
    'Signature | signature | false | ',
    'Address | long_text | false | ',
  ])
  const table = items.find((it) => 'field' in it && it.field.kind === 'table')
  assert.ok('field' in table)
  assert.deepEqual(
    table.field.columns.map((c) => `${c.label}:${c.kind}`),
    ['Company:text', 'From:text', 'Salary:money'],
  )
  const sketch = toSketch([items])
  assert.equal(sketch.title, 'PERSONAL DETAILS')
  assert.equal(sketch.sections.length, 1)
})
test('a table whose first column asks the questions gives a table with a fixed row per question', () => {
  const shapes = {
    width: 800,
    height: 600,
    em: 20,
    mask: new Uint8Array(0),
    rules: [],
    ticks: [R(330, 120, 348, 138), R(430, 120, 448, 138), R(330, 170, 348, 188), R(430, 170, 448, 188)],
    frames: [{ ...R(50, 50, 650, 200), cols: [300, 400, 500], rows: [100, 150] }],
  }
  const words = [
    W('SAFETY', 50, 20, 150),
    W('CHECK', 160, 20, 240),
    W('Item', 60, 65, 100),
    W('Yes', 320, 65, 350),
    W('No', 420, 65, 440),
    W('Remarks', 510, 65, 590),
    W('Fire', 60, 115, 100),
    W('exit', 105, 115, 140),
    W('Helmet', 60, 165, 130),
  ]
  const items = readPage(shapes, words)
  assert.equal(items.length, 1)
  const t = items[0].field
  assert.equal(t.label, 'SAFETY CHECK')
  assert.equal(t.kind, 'table')
  assert.deepEqual(t.rows, ['Fire exit', 'Helmet'])
  assert.equal(t.rowHeading, 'Item')
  assert.deepEqual(
    t.columns.map((c) => `${c.label} | ${c.kind}`),
    ['Answer | yes_no', 'Remarks | long_text'],
  )
})
test('labels lose numbering, stars and trailing dots', () => {
  assert.equal(cleanLabel('1. Full name*:'), 'Full name')
  assert.equal(cleanLabel('(b) Date of birth ....'), 'Date of birth')
  assert.equal(cleanLabel('ii) पता :'), 'पता')
  assert.equal(cleanLabel('I am a citizen'), 'I am a citizen')
  assert.equal(cleanLabel('1 declare that it is true'), 'I declare that it is true')
  assert.equal(cleanLabel('1 Apple'), '1 Apple')
  assert.equal(cleanLabel('Estimated amount (Rs.):'), 'Estimated amount (Rs.)')
  assert.equal(cleanLabel('Place’'), 'Place')
  assert.equal(cleanLabel('Address®'), 'Address')
  assert.equal(cleanLabel('पता (हिंदी में):'), 'पता (हिंदी में)')
  assert.equal(cleanLabel('Married?'), 'Married?')
})
test('the D of a word is not a box to tick, a box beside its words is', () => {
  const { g, fill, frame } = page(600, 200)
  for (let i = 0; i < 20; i++) fill(20 + i * 22, 20, 32 + i * 22, 34) // letters, so em is about 24
  // a blocky D (straight left side, round right) glued to the next letter
  fill(100, 100, 103, 120)
  fill(100, 100, 112, 103)
  fill(100, 117, 112, 120)
  fill(112, 103, 115, 117)
  fill(117, 108, 127, 120) // "a", right next to it
  frame(300, 100, 318, 118) // a real box, a space before its word
  fill(326, 104, 336, 118)
  const s = findShapes(g)
  assert.equal(s.ticks.length, 1)
  assert.equal(s.ticks[0].x0, 300)
})
const fieldsOf = (shapes, words) => readPage(shapes, words).flatMap((it) => ('field' in it ? [it.field] : []))
const empty = (frames, ticks = [], rules = []) => ({ width: 1200, height: 1600, em: 20, mask: new Uint8Array(0), rules, ticks, frames })
test('a line drawn a little under its label belongs to that label, not the one on the next line', () => {
  // "SHIP: ____" with the line 0.9 em below the words' bottom, and "IMO NUMBER: ____" under it
  const shapes = empty([], [], [R(120, 138, 400, 140), R(170, 208, 400, 210)])
  const out = fieldsOf(shapes, [W('SHIP:', 50, 100, 110), W('IMO', 50, 170, 90), W('NUMBER:', 95, 170, 160)])
  assert.deepEqual(
    out.map((f) => f.label),
    ['SHIP', 'IMO NUMBER'],
  )
})
test('boxes with their words before them, and rows of boxes in a grid, make one question', () => {
  const ticks = [R(200, 100, 218, 118), R(400, 100, 418, 118), R(200, 140, 218, 158), R(400, 140, 418, 158)]
  const words = [
    W('Qualifications', 50, 68, 220),
    W('(tick', 230, 68, 280),
    W('all)', 290, 68, 330),
    W('Master', 130, 99, 190),
    W('C/O', 340, 99, 390),
    W('BRM', 140, 139, 190),
    W('Other', 330, 139, 390),
  ]
  const [q] = fieldsOf(empty([], ticks), words)
  assert.equal(q.kind, 'many_of')
  assert.equal(q.label, 'Qualifications (tick all)')
  assert.deepEqual(q.options, ['Master', 'C/O', 'BRM', 'Other'])
})
test('a frame of cells, each with a box and its words, is one question named by its title row', () => {
  const frames = [{ ...R(50, 50, 650, 200), cols: [250, 450], rows: [100, 150] }]
  const ticks = [R(60, 115, 78, 133), R(260, 115, 278, 133), R(460, 115, 478, 133), R(60, 165, 78, 183), R(260, 165, 278, 183)]
  const words = [
    W('OPERATIONS', 60, 65, 200),
    W('Loading', 85, 114, 160),
    W('Discharging', 285, 114, 400),
    W('Bunkering', 485, 114, 580),
    W('Ballasting', 85, 164, 180),
    W('Idle', 285, 164, 330),
  ]
  const [q] = fieldsOf(empty(frames, ticks), words)
  assert.equal(q.kind, 'many_of')
  assert.equal(q.label, 'OPERATIONS')
  assert.deepEqual(q.options, ['Loading', 'Discharging', 'Bunkering', 'Ballasting', 'Idle'])
})
test('lines in columns under headings make a table; numbered empty rows make a table to add rows to', () => {
  const rules = [R(200, 140, 380, 142), R(400, 140, 580, 142), R(200, 190, 380, 192), R(400, 190, 580, 192)]
  const [t] = fieldsOf(empty([], [], rules), [W('SUPERINTENDENT', 40, 120, 180), W('RANK', 260, 90, 320), W('DATE', 460, 90, 520)])
  assert.equal(t.kind, 'table')
  assert.equal(t.label, 'SUPERINTENDENT')
  assert.deepEqual(
    t.columns.map((c) => `${c.label} ${c.kind}`),
    ['RANK text', 'DATE date'],
  )
  assert.equal(t.minRows, 2)
  const frames = [{ ...R(50, 100, 650, 250), cols: [100], rows: [150, 200] }]
  const [n] = fieldsOf(empty(frames), [W('Best', 60, 60, 120), W('Practices', 130, 60, 230), W('1.', 60, 115, 80), W('2.', 60, 165, 80), W('3.', 60, 215, 80)])
  assert.equal(n.kind, 'table')
  assert.equal(n.label, 'Best Practices')
  assert.equal(n.minRows, 3)
})
test('across pages: a table heading printed again is kept once; nameless and page-number fields are left out', () => {
  const at = R(0, 0, 10, 10)
  const f = (label, kind = 'text', columns = []) => ({ key: '', label, kind, required: false, help: '', options: [], columns })
  const col = (label) => ({ key: '', label, kind: 'text', options: [] })
  const sketch = toSketch([
    [
      { at, field: f('Name') },
      { at, heading: 'PLANNED MAINTENANCE' },
      { at, field: f('Comments', 'long_text') },
      { at, field: f('') },
    ],
    [
      { at, field: f('PLANNED MAINTENANCE', 'table', [col('Equipment'), col('Comments')]) },
      { at, field: f('12') },
    ],
  ])
  assert.deepEqual(
    sketch.sections.flatMap((s) => s.fields.map((x) => x.label)),
    ['Name', 'PLANNED MAINTENANCE'],
  )
  assert.equal(sketch.skipped, 1)
})
