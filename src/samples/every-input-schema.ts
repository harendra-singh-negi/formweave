// The 'Every input' sample's schema, made from the builder's palette so it always has every input.
import { PALETTE } from '../builder/palette.ts'
import type { Fields, FormSchema, Layout } from '../core/schema.ts'

export /** Every input of the palette, a section per group, two columns. */
function everyInput(): FormSchema {
  const fields: Fields = {}
  const layout: Layout[] = PALETTE.map(([group, items]) => {
    for (const [key, , f] of items) fields[key] = structuredClone(f)
    return { type: 'section', title: group, look: 'line', children: [{ type: 'grid', cols: { base: 1, md: 2 }, children: items.map(([key]) => key) }] }
  })
  return { version: 1, title: 'Every input', fields, layout }
}
