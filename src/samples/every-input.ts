// Sample: Every input. Made-up data.
import type { Sample } from './types.ts'
import { everyInput } from './every-input-schema.ts'
import { PALETTE } from '../builder/palette.ts'

export const everyInputSample: Sample = {
  id: 'every-input',
  title: 'Every input',
  about: `All ${PALETTE.reduce((n, [, items]) => n + items.length, 0)} inputs of the palette, a section per group: text, numbers, choices, dates, files, signature, map, IDs, tables…`,
  schema: everyInput(),
}
