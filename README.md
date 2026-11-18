# formweave

Forms as JSON: one engine for validation, conditions and formulas that runs in the browser and on your server.

Status: phase 1, the engine. The renderer, builder and document import come next. Not published yet.

```ts
import { validate, createForm, lint, type FormSchema } from 'formweave'

const schema: FormSchema = {
  version: 1,
  fields: {
    employment: { type: 'choice', options: ['Salaried', 'Self Employed'], required: true },
    business: { type: 'string', visible: "employment == 'Self Employed'", required: true },
    items: { type: 'list', min: 1, fields: {
      qty: { type: 'number', min: 1 },
      price: { type: 'number', decimals: 2 },
      total: { type: 'number', value: 'qty * price', decimals: 2 },
    } },
    gst: { type: 'number', value: 'sum(items.total) * 18 / 100', decimals: 2 },
  },
}

lint(schema)                                // [] — run it on any schema you load
const { ok, values, errors } = validate(schema, req.body) // on your server
const form = createForm(schema)             // in any UI: set(), subscribe(), submit()
```

## Show it

```tsx
// React
import { Form } from 'formweave/react'
import 'formweave/style.css'
<Form schema={schema} locale="hi" widgets={{ signature: MySignaturePad }} onSubmit={save} />
```

```html
<!-- Angular, Vue, Svelte, server-rendered pages, plain HTML -->
<formweave-form id="f"></formweave-form>
<script type="module">
  import 'formweave/element'
  f.schema = schema
  f.addEventListener('fw-submit', (e) => save(e.detail))
</script>
```

- Layout: `section`, `grid` (columns follow the form's own width through container queries), `pages` (`steps`, `tabs`, `accordion`) and `content`.
- Widgets: the built-ins cover all 8 types. Pass your own by widget name or by type. Each widget draws only its control; formweave adds the label, help and error.
- Accessibility: every label is tied to its input, and errors are announced through `aria-describedby`. Submitting focuses the first error and opens the page it is on.
- Theming: change the `--fw-*` CSS variables. All styles stay under `.fw-form`.
- Headless: `useForm(schema)` gives `{ form, state }` for a UI of your own.

## Build it visually

```tsx
import { Builder } from 'formweave/builder'
<Builder schema={saved} onChange={(schema, issues) => issues.length || save(schema)} />
```

Or `<formweave-builder>` from `formweave/element`, which fires `fw-change` with `{ schema, issues }`.

- Add the 8 field types. Add fields into groups and lists, and drag them or use ↑ ↓ to reorder.
- Duplicate, delete, undo and redo (Ctrl+Z, Ctrl+Shift+Z).
- The settings panel is itself a formweave form. It covers key, label, help, required, "show only when", "calculated value", options and limits.
- Renaming or deleting a field keeps the layout pointing at the right keys. `lint()` shows any formula that still uses an old name.
- Preview fills the form for real. The JSON tab copies the schema, or loads one after linting it.
- The Layout tab adds sections, grids (columns per width), pages (steps, tabs, accordion), headings, text and dividers. Fields are dragged into them, and each part gets its title, columns and "show only when". Fields not placed yet are listed, and removing a container keeps what is inside it.
- Still to come: translations and templates.

## Field types

`string` · `number` · `boolean` · `choice` · `date` · `file` · `group` · `list`.
How a field looks (radio, toggle, textarea, table…) is its `widget`, which the renderer reads.
Every field can have `visible`, `readOnly`, `check`, `validators` and `messages`; every value field also has `required` and `value` (calculated).

## Formulas

- Operators: `+ - * / %`, `== != < <= > >=`, `and or not` (also `&& || !`), `'text'`, `true false null`.
- Functions: `sum avg min max count round abs if empty contains len days`.
- Names are field keys. In a group or list row, the row's own fields come first. `items.total` gives every row's total, and `context.role` reads what your app passes in.
- A blank value counts as 0 in arithmetic. `x == null` means "x is blank". Results keep 15 significant digits, so `0.1 + 0.2` is `0.3`.
- Formulas are never run with `eval`.

## What `validate` does

1. Keeps only the schema's keys and turns values into their type (`'12'` → `12`).
2. Recomputes calculated fields, ignoring what the client sent for them.
3. Leaves hidden fields out and skips checking them.
4. Returns errors by path (`items.0.qty`), each as `{ code, message }`.

## Development

```sh
npm test          # node:test, Node 22.6+
npm run typecheck
npm run build     # dist/, no DOM or Node APIs in the engine
```
