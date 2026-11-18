// The built-in widgets, by type. Your own replace them by widget name or type through <Form widgets>.
import type { Widgets } from '../context.ts'
import { BooleanInput } from './boolean.ts'
import { ChoiceInput } from './choice.ts'
import { DateInput } from './date.ts'
import { FileInput } from './file.ts'
import { GroupInput, ListInput } from './list.ts'
import { NumberInput } from './number.ts'
import { StringInput } from './text.ts'

/** The built-in widgets, by type. */
export const WIDGETS: Widgets = {
  string: StringInput,
  number: NumberInput,
  boolean: BooleanInput,
  choice: ChoiceInput,
  date: DateInput,
  file: FileInput,
  group: GroupInput,
  list: ListInput,
}
