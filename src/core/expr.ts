/** Formulas: parsed once into a tree and evaluated without eval or Function. */

export type Node =
  | { t: 'lit'; v: unknown }
  | { t: 'ref'; path: string[] }
  | { t: 'call'; fn: string; args: Node[] }
  | { t: 'not' | 'neg'; a: Node }
  | { t: 'op'; op: string; a: Node; b: Node }

/** Reads a name such as ['items', 'total']. */
export type Get = (path: string[]) => unknown

export class ExprError extends Error {}

const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)|(==|!=|<=|>=|&&|\|\||[-+*/%<>(),!]))/y
const KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false', 'null'])
const BINARY: Record<string, [number, string]> = {
  or: [1, 'or'],
  '||': [1, 'or'],
  and: [2, 'and'],
  '&&': [2, 'and'],
  '==': [4, '=='],
  '!=': [4, '!='],
  '<': [4, '<'],
  '<=': [4, '<='],
  '>': [4, '>'],
  '>=': [4, '>='],
  '+': [5, '+'],
  '-': [5, '-'],
  '*': [6, '*'],
  '/': [6, '/'],
  '%': [6, '%'],
}
/** `not a == b` is `not (a == b)`. */
const NOT = 3

type Tok = { k: 'num' | 'str' | 'name' | 'op' | 'end'; v: string; at: number }

function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  for (let i = 0; ;) {
    TOKEN.lastIndex = i
    const m = TOKEN.exec(src)
    if (!m) {
      const at = src.length - src.slice(i).trimStart().length
      if (at < src.length) throw new ExprError(`Unexpected '${src[at]}' at ${at + 1}`)
      toks.push({ k: 'end', v: '', at })
      return toks
    }
    const at = i + m[0].length - m[0].trimStart().length
    const unescape = (s: string) => s.replace(/\\(.)/g, '$1')
    if (m[1] !== undefined) toks.push({ k: 'num', v: m[1], at })
    else if (m[2] !== undefined) toks.push({ k: 'str', v: unescape(m[2]), at })
    else if (m[3] !== undefined) toks.push({ k: 'str', v: unescape(m[3]), at })
    else if (m[4] !== undefined) toks.push({ k: 'name', v: m[4], at })
    else toks.push({ k: 'op', v: m[5], at })
    i += m[0].length
  }
}

export function parse(src: string): Node {
  if (src.length > 2000) throw new ExprError('A formula is at most 2000 characters')
  const toks = tokenize(src)
  let p = 0
  const fail = (msg: string, tok = toks[p]): never => {
    throw new ExprError(`${msg} at ${tok.at + 1}`)
  }
  const unexpected = (tok = toks[p]): never => fail(tok.k === 'end' ? 'Unexpected end' : `Unexpected '${tok.v}'`, tok)
  const is = (v: string) => (toks[p].k === 'op' || toks[p].k === 'name') && toks[p].v === v
  const expect = (v: string) => {
    if (!is(v)) unexpected()
    p++
  }

  const binary = (min: number): Node => {
    let a = unary()
    for (;;) {
      const t = toks[p]
      const op = (t.k === 'op' || t.k === 'name') && Object.hasOwn(BINARY, t.v) ? BINARY[t.v] : undefined
      if (!op || op[0] < min) return a
      p++
      a = { t: 'op', op: op[1], a, b: binary(op[0] + 1) }
    }
  }
  const unary = (): Node => {
    if (is('not') || is('!')) {
      p++
      return { t: 'not', a: binary(NOT + 1) }
    }
    if (is('-')) {
      p++
      return { t: 'neg', a: unary() }
    }
    return primary()
  }
  const primary = (): Node => {
    const t = toks[p++]
    if (t.k === 'num') return { t: 'lit', v: Number(t.v) }
    if (t.k === 'str') return { t: 'lit', v: t.v }
    if (t.k === 'op' && t.v === '(') {
      const e = binary(1)
      expect(')')
      return e
    }
    if (t.k !== 'name') return unexpected(t)
    if (t.v === 'true' || t.v === 'false') return { t: 'lit', v: t.v === 'true' }
    if (t.v === 'null') return { t: 'lit', v: null }
    if (KEYWORDS.has(t.v)) return unexpected(t)
    if (!is('(')) return { t: 'ref', path: t.v.split('.') }
    p++
    if (!Object.hasOwn(FUNCTIONS, t.v)) fail(`Unknown function '${t.v}'`, t)
    const args: Node[] = []
    if (!is(')'))
      for (;;) {
        args.push(binary(1))
        if (!is(',')) break
        p++
      }
    expect(')')
    const [, min, max] = FUNCTIONS[t.v]
    if (args.length < min || args.length > max) {
      const n = min === max ? `${min}` : max === Infinity ? `${min} or more` : `${min}–${max}`
      fail(`${t.v}() takes ${n} argument${n === '1' ? '' : 's'}`, t)
    }
    return { t: 'call', fn: t.v, args }
  }

  const node = binary(1)
  if (toks[p].k !== 'end') unexpected()
  return node
}

export function evaluate(n: Node, get: Get): unknown {
  switch (n.t) {
    case 'lit':
      return n.v
    case 'ref':
      return get(n.path) ?? null
    case 'not':
      return !truthy(evaluate(n.a, get))
    case 'neg':
      return clean(-num(evaluate(n.a, get)))
    case 'call':
      return FUNCTIONS[n.fn][0](n.args.map((a) => evaluate(a, get)))
    case 'op': {
      if (n.op === 'and') return truthy(evaluate(n.a, get)) && truthy(evaluate(n.b, get))
      if (n.op === 'or') return truthy(evaluate(n.a, get)) || truthy(evaluate(n.b, get))
      const a = evaluate(n.a, get)
      const b = evaluate(n.b, get)
      switch (n.op) {
        case '==':
          return same(a, b)
        case '!=':
          return !same(a, b)
        case '<':
          return order(a, b) < 0
        case '<=':
          return order(a, b) <= 0
        case '>':
          return order(a, b) > 0
        case '>=':
          return order(a, b) >= 0
        case '+':
          return typeof a === 'string' || typeof b === 'string' ? str(a) + str(b) : clean(num(a) + num(b))
        case '-':
          return clean(num(a) - num(b))
        case '*':
          return clean(num(a) * num(b))
        case '/':
          return clean(num(a) / num(b))
        case '%':
          return clean(num(a) % num(b))
      }
    }
  }
  return null
}

/** Every name a formula reads. */
export function refs(n: Node, out: string[][] = []): string[][] {
  if (n.t === 'ref') out.push(n.path)
  else if (n.t === 'call') for (const a of n.args) refs(a, out)
  else if (n.t === 'op') refs(n.b, refs(n.a, out))
  else if (n.t === 'not' || n.t === 'neg') refs(n.a, out)
  return out
}

/** Blank: null, '', spaces only, or an empty list. */
export const empty = (x: unknown): boolean =>
  x === null || x === undefined || (typeof x === 'string' && x.trim() === '') || (Array.isArray(x) && x.length === 0)

export const truthy = (x: unknown): boolean => !empty(x) && x !== false && x !== 0 && !Number.isNaN(x)

export const numeric = (s: string): boolean => s.trim() !== '' && Number.isFinite(Number(s))

/** Blank counts as 0, as in a spreadsheet. */
const num = (x: unknown): number =>
  x === null || x === undefined || x === ''
    ? 0
    : typeof x === 'number'
      ? x
      : typeof x === 'boolean'
        ? +x
        : typeof x === 'string' && numeric(x)
          ? Number(x)
          : NaN

export const str = (x: unknown): string => (x == null ? '' : Array.isArray(x) ? x.map(str).join(', ') : String(x))

// ponytail: binary floats cleaned to 15 significant digits like Excel (0.1 + 0.2 is 0.3); a decimal library if sums need more exact digits
const clean = (x: number): number | null => (Number.isFinite(x) ? +x.toPrecision(15) || 0 : null)

/** Half away from zero: round(1.005, 2) is 1.01, round(-2.5) is -3. */
export function round(x: number, digits: number): number | null {
  if (!Number.isFinite(x)) return null
  const d = Math.min(15, Math.max(0, Math.trunc(digits) || 0))
  const a = Math.abs(x)
  // shift in text: 1.005 * 100 is 100.49999…, which would round down
  const r = String(a).includes('e') ? Math.round(a * 10 ** d) / 10 ** d : Number(Math.round(Number(`${a}e${d}`)) + `e-${d}`)
  return clean(Math.sign(x) * r)
}

function same(a: unknown, b: unknown): boolean {
  if (empty(a) || empty(b)) return empty(a) && empty(b)
  if (typeof a === 'number' || typeof b === 'number') return num(a) === num(b)
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b)
  return a === b
}

/** Text is compared as text ('2026-01-05' < '2026-02-01'), anything else as numbers. Blank never compares. */
function order(a: unknown, b: unknown): number {
  if (empty(a) || empty(b)) return NaN
  if (typeof a === 'string' && typeof b === 'string' && !(numeric(a) && numeric(b))) return a < b ? -1 : a > b ? 1 : 0
  return num(a) - num(b)
}

function day(x: unknown): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(x))
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000 : null
}

const filled = (args: unknown[]) => (args.flat(Infinity) as unknown[]).filter((x) => !empty(x))
const numbers = (args: unknown[]) => filled(args).map(num).filter(Number.isFinite)

/** name → [function, fewest args, most args]. Lists (items.total) are flattened. */
export const FUNCTIONS: Record<string, [(args: unknown[]) => unknown, number, number]> = {
  sum: [(a) => clean(numbers(a).reduce((s, x) => s + x, 0)), 1, Infinity],
  avg: [
    (a) => {
      const n = numbers(a)
      return n.length ? clean(n.reduce((s, x) => s + x, 0) / n.length) : null
    },
    1,
    Infinity,
  ],
  min: [
    (a) => {
      const n = numbers(a)
      return n.length ? n.reduce((m, x) => Math.min(m, x)) : null
    },
    1,
    Infinity,
  ],
  max: [
    (a) => {
      const n = numbers(a)
      return n.length ? n.reduce((m, x) => Math.max(m, x)) : null
    },
    1,
    Infinity,
  ],
  count: [(a) => filled(a).length, 1, Infinity],
  round: [([x, d]) => (empty(x) ? null : round(num(x), num(d))), 1, 2],
  abs: [([x]) => (empty(x) ? null : clean(Math.abs(num(x)))), 1, 1],
  if: [([c, a, b]) => (truthy(c) ? a : b), 3, 3],
  empty: [([x]) => empty(x), 1, 1],
  contains: [([h, n]) => (Array.isArray(h) ? h.some((x) => same(x, n)) : str(h).includes(str(n))), 2, 2],
  len: [([x]) => (Array.isArray(x) ? x.length : str(x).length), 1, 1],
  days: [
    ([from, to]) => {
      const a = day(from),
        b = day(to)
      return a === null || b === null ? null : b - a
    },
    2,
    2,
  ],
}
