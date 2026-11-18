import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, parse } from '../src/core/expr.js'
const run = (src, vars = {}) => evaluate(parse(src), (path) => path.reduce((v, k) => (v != null && Object.hasOwn(v, k) ? v[k] : undefined), vars))
test('formulas', () => {
  const cases = [
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['-2 * 3 + 10 % 4', -4],
    ['0.1 + 0.2', 0.3],
    ['10 / 0', null],
    ['qty * price', 0, { qty: null, price: 5 }],
    ["first + ' ' + last", 'Asha Rao', { first: 'Asha', last: 'Rao' }],
    ["employment == 'Self Employed' and age >= 18", true, { employment: 'Self Employed', age: 30 }],
    ['not a == 1', true, { a: 2 }],
    ['x == null', true, { x: '' }],
    ["'10' > 9", true],
    ["'2026-01-05' < '2026-02-01'", true],
    ['round(1.005, 2)', 1.01],
    ['round(-2.5)', -3],
    ["days('2026-01-01', '2026-03-01')", 59],
    ["if(n > 1, 'many', 'one')", 'many', { n: 2 }],
    ["contains(tags, 'Fire')", true, { tags: ['Fire', 'Flood'] }],
    ['sum(1, null, 2.5) + count(tags)', 5.5, { tags: ['a', 'b'] }],
    ['avg(list)', null, { list: [] }],
  ]
  for (const [src, want, vars] of cases) assert.deepEqual(run(src, vars), want, src)
})
test('a bad formula says what and where', () => {
  assert.throws(() => parse('1 +'), /Unexpected end at 4/)
  assert.throws(() => parse('nope(1)'), /Unknown function 'nope'/)
  assert.throws(() => parse('constructor(1)'), /Unknown function/)
  assert.throws(() => parse('round()'), /round\(\) takes 1–2 arguments/)
  assert.throws(() => parse('a b'), /Unexpected 'b' at 3/)
  assert.throws(() => parse('a # b'), /Unexpected '#' at 3/)
})
