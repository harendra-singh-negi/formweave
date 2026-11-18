# formweave

Forms as JSON: one engine for validation, conditions and formulas that runs in the browser and on your server.

Status: the engine, the renderer, the visual builder and scan import all work. Not on npm yet.

## Install

It isn't on npm yet, so install it from this folder:

```sh
cd formweave && npm install && npm run build   # makes dist/
cd ../your-app && npm install ../formweave     # or: npm pack in formweave, then npm install ./formweave-0.0.0.tgz
```

Run `npm run build` in formweave again after you change it. Only install what you use:

- `react` and `react-dom` for `formweave/react` and `formweave/builder`;
- `tesseract.js` for `formweave/scan`, plus `pdfjs-dist` to read PDFs.

The engine (`formweave`) needs none of them.

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
- Stepper: numbered steps joined by a line, with done steps ticked and clickable to go back. Next checks the current step before moving on. `position: 'top' | 'left' | 'right' | 'bottom'` places it. Left and right show at the top when the form is narrow, and on a phone only the current step keeps its name.
- Widgets: the built-ins cover all 8 types. Pass your own by widget name or by type. Each widget draws only its control; formweave adds the label, help and error.
- Accessibility: every label is tied to its input, and errors are announced through `aria-describedby`. Submitting focuses the first error and opens the page it is on.
- Theming: change the `--fw-*` CSS variables. All styles stay under `.fw-form`.
- Tables (`type: 'list', widget: 'table'`): each field in the list is a column, and its label is the column heading. People add rows with "+ Add row". On a narrow form each row becomes a card with every heading above its box, so nothing scrolls sideways. Without `widget: 'table'`, every row is a card at any width.
- Tabs and accordion: underlined tabs that scroll sideways when they don't fit, with arrow keys between them. The accordion has one bordered panel per page. When a form is sent with an error in a closed panel, that panel opens.

### Your own CSS and classes

```tsx
<Form
  schema={schema}
  className="my-form"
  classes={{ field: 'mb-3', label: 'form-label', input: 'form-control', error: 'invalid-feedback d-block', button: 'btn btn-outline-secondary', submit: 'btn btn-primary' }}
/>
```

- `classes` puts your classes on every field, label, input, help text, error and button, so Bootstrap, Tailwind or your own CSS all work. `input` goes on text boxes, numbers, dates, dropdowns and file pickers, but not on checkboxes or radio buttons.
- `className` on a field, section, grid, pages or content adds classes to just that part. The builder has a "CSS classes" box in every field's and layout part's settings.
- For `<formweave-form>`, set `el.classes = { … }`.
- Your classes are added next to formweave's own `fw-*` classes, so the layout stays responsive. Columns, steps and tabs still follow the form's width. If you want only your own styles, leave out `formweave/style.css`. Columns, the stepper and the tabs then need CSS of your own.
- Headless: `useForm(schema)` gives `{ form, state }` for a UI of your own.

## Build it visually

```tsx
import { Builder } from 'formweave/builder'
<Builder schema={saved} onChange={(schema, issues) => issues.length || save(schema)} />
```

Or `<formweave-builder>` from `formweave/element`, which fires `fw-change` with `{ schema, issues }`.

- It opens on the Design tab: the form itself, as people will see it. Click a field, a section, a grid, a page or a text on it to change it in the panel beside it; the form updates as you type. Drag anything on it to move it, or drag an input or a layout piece from the palette onto the spot it should go. Fields hidden by "show only when" are shown faded, any step can be opened, and Delete removes what is picked. With nothing picked, the panel holds the form's own settings. `<Form design>` is what draws it, if you build a canvas of your own.
- Add the 8 field types: click one, or drag it from the palette to the spot it should go, groups and lists included. Drag fields or use ↑ ↓ to reorder. A line shows where a drop will land.
- Duplicate, delete, undo and redo (Ctrl+Z, Ctrl+Shift+Z).
- The settings panel is itself a formweave form. It covers key, label, help, required, "show only when", "calculated value", options and limits.
- Renaming or deleting a field keeps the layout pointing at the right keys. `lint()` shows any formula that still uses an old name.
- Preview fills the form for real. The JSON tab copies the schema, or loads one after linting it.
- The Layout tab adds sections, grids (columns per width), pages (steps, tabs, accordion, with the steps at the top, left, right or bottom), headings, text and dividers. "Make it a stepper" turns a form with no layout into one step to split from. Fields are dragged into them, and each part gets its title, columns and "show only when". Fields not placed yet are listed, and removing a container keeps what is inside it.
- Still to come: translations and templates.

## JSON Schema in and out

```ts
import { fromJsonSchema, toJsonSchema } from 'formweave'

const { schema, warnings } = fromJsonSchema(openApiBody) // or z.toJSONSchema(zodSchema)
const forBackend = toJsonSchema(schema) // validate submissions in Java, Python, Go, PHP…
```

- Supported: `type`, `required`, `title` → label, `description` → help, `enum` and `oneOf: [{ const, title }]` → choices, and arrays of enums → multiple choice.
- Also: arrays of objects → table, nested objects → groups, `$ref` into `$defs`/`definitions`, nullable types, `allOf`, and `minLength`/`maxLength`/`pattern`/`minimum`/`maximum`/`minItems`/`maxItems`. `format: email | uri | date | date-time | time | binary` is read too.
- Anything that can't be carried over comes back in `warnings`, for example a key that isn't a valid name gets renamed.
- In the builder, paste a JSON Schema into the JSON tab to turn it into a form.
- In `toJsonSchema`, a field with a "show only when" condition is never listed as required, because it may be hidden. `validate()` still checks it.

## Forms from photos, scans and PDFs

The pages are read on the device, so it needs no AI service, no account and no subscription, and nothing is
uploaded. [tesseract.js](https://github.com/naptha/tesseract.js) (free, open source) reads the printed words.
formweave finds the shapes on the page and pairs them with the words: lines to write on, boxes to tick, boxes to fill,
boxes for one character each, and tables.

```tsx
import { scanForm } from 'formweave/scan'
import * as pdfjs from 'pdfjs-dist' // only to read PDFs
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const scan = (files: File[], progress: (m: string) => void) =>
  scanForm(files, { languages: ['eng', 'hin'], pdfjs, progress }) // → { schema, warnings }

<Builder scan={scan} /> // adds a "From a PDF or photo…" button and a "Scan / Import" tab
```

What it turns into fields:
- **Answer lines** after a label ("Name: ______"), or with the label below or above them. Dotted lines, dashes and typed underscores count as answer lines too.
- **Dates and long answers:** `__/__/____` becomes a date. Several lines under one label become one long answer.
- **Tick boxes:**
  - A row of them becomes a choice, and "☐ Yes ☐ No" becomes yes/no.
  - A stacked list, "(tick all that apply)" or a grid of boxes allows several. A grid becomes one question, in a frame or not, with its words before or after each box.
  - A graded scale (below average … above average) takes one answer.
  - A single box beside a statement becomes a checkbox.
- **Boxes to fill**, with the label inside them, beside them or above them. A box with a lot of room becomes a long answer.
- **One box per character** (PAN, PIN code): one text field whose length is the number of boxes.
- **Tables:**
  - An empty table becomes a table people add rows to. It starts with as many rows as the paper has, and a "No." column is left out because rows are numbered anyway. Lines in columns under headings (RANK  NAME  SIGNATURE  DATE) count as a table too, and so do numbered empty rows.
  - A table whose first column lists questions becomes a table with a fixed row per question. Its box columns become one choice (1 2 3 4 5 N/S, Yes / No), and "Yes/No" printed in the cells becomes the choices.
  - Column lines that stop at some rows (a title row, "Label | value" rows, then the table) are read part by part.
  - A table printed again at the top of the next page is kept once.
  - Columns already printed full of data (a payslip) are not asked for.
- **Kinds from the label:** email, phone, date, time, amount, number, signature, photo or file, and address or remarks.
- **Required** when the label has a `*`.
- **Fields side by side** on one line ("SHIP ___  GT ___") stay side by side, in a grid that becomes one column on a phone. "LAST PSC INSPECTION: Place ___ Date ___" names both fields after the lead-in.
- **Headings** (numbered, in capitals or larger) become sections, and the first one becomes the title. Running page headers and footers, and lines or boxes that nothing names, are left out, and the warnings say how many.

Good to know:
- **Languages:** pass Tesseract's language codes, for example `['eng', 'hin']`. The first scan downloads the engine and the language files (a few MB) from a public CDN and caches them. Pass `tesseract: { workerPath, corePath, langPath }` to serve them yourself and work offline.
- **What reads well:** clear printed forms, such as scans, screenshots, PDFs, and photos taken straight on.
- **What reads less well:** skewed or curled photos, handwriting, and forms without lines or boxes.
- **Afterwards:** the result is a starting point to check in the builder. `warnings` lists what was changed, and the schema always passes `lint()`.
- **PDFs made on a computer** carry their words, and those are used exactly as they are, with no text recognition and no download. Scanned pages are read with OCR.
- **Without pdf.js**, only pictures can be read.
- **To see what a change finds:** `node --experimental-strip-types scripts/scan-pdf.ts form.pdf` prints the outline of any PDF with a text layer (it needs poppler's `pdftoppm` and `pdftotext`).

## Field types

`string` · `number` · `boolean` · `choice` · `date` · `file` · `group` · `list`.
How a field looks (radio, toggle, textarea, table…) is its `widget`, which the renderer reads.
Every field can have `visible`, `readOnly`, `check`, `validators` and `messages`; every value field also has `required` and `value` (calculated).

The built-in widgets and formats. The builder's palette lists 64 ready-made inputs in groups, with a search box. Some are groups of fields: date, time and number ranges (To is checked against From), address, full name and cascading dropdowns. Others are text fields with a pattern: PAN, Aadhaar, GSTIN, IFSC, PIN code and bank account. Any of them can be a column of a table.

| Type | `widget` / `format` |
| --- | --- |
| `string` | `textarea`, `password`, `search`, `phone` (country code + number, `country: 'IN'` first), `otp` (one box per character, `maxLength` boxes), `signature` (drawn; the value is an SVG drawing), `location` ("lat,lng", with a "Use my location" button), `barcode` (typed, or read with the camera where the browser has BarcodeDetector), `markdown`, `code`, `json`, `hidden`; formats `email`, `url`, `phone`, `color`, `country` (ISO code, names in the form's language), `card` (Luhn-checked), `iban` (check digits), `json` |
| `number` | `stepper` (− / +), `slider` (`min`..`max`), `rating` (`max` stars, 5 by default), `hidden`; formats `currency` (with `currency: 'INR'` it shows ₹ in front) and `percent` |
| `boolean` | a checkbox, or `toggle` |
| `choice` | `select`, `radio` (radio group), `buttons` (button group; checkboxes with `multiple`), `autocomplete` (type to search), `tags` (with `allowOther`), a checkbox group with `multiple`, or `multiple` with `select`. An option's `visible` formula makes cascading choices: `{ value: 'Pune', visible: "state == 'Maharashtra'" }`. `allowOther` accepts typed answers that aren't options |
| `date` | formats `date`, `time`, `datetime`, `month`, `week`, `year` |
| `file` | a drop zone and a picker; `camera` opens the phone's camera. `accept` limits it to images, video, audio or documents |
| `list` | rows as cards, or `table`. `rows: ['Monday', 'Tuesday']` makes a table with fixed rows: the text sits in the first column under `rowHeading`, and no rows are added or removed. The submitted rows come in the same order |

Show a signature with `<img src={'data:image/svg+xml,' + encodeURIComponent(value)}>`. An `<img>` never runs script from an SVG, so a tampered value can't either. It can be drawn only with a mouse, finger or pen, so add a typed-name field next to it for people who can't draw.

**Rich text** (`widget: 'richtext'`): bold, italic, underline, strike, a heading, lists, quotes and links.
- The value is HTML, cleaned in the browser by `cleanHtml` from `formweave/react`. Only those tags are kept, and links only to http, https and mailto.
- Clean it again on your server (with DOMPurify, for example) before you show it anywhere, because a client can send anything.
- For a full editor, pass Tiptap, Lexical or similar as your own widget.

**Map** (`widget: 'map'`): a "lat,lng" box, "Use my location", and a map to drag, zoom with + / −, and click to place the pin.
- Tiles come from OpenStreetMap by default. Their usage policy asks busy sites to use their own tiles or a provider's, so pass `<Form mapTiles={{ url: 'https://…/{z}/{x}/{y}.png', attribution: '…' }}>`.
- Each person's browser fetches the tiles from that server.

A group or table without a label shows no title, only its fields.

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
npm run demo      # opens the demo app at http://127.0.0.1:5180 (Build and Fill tabs, live reload)
npm test          # node:test, Node 22.6+
npm run typecheck
npm run build     # dist/, no DOM or Node APIs in the engine
```

The demo runs from `src/` through Vite, works offline, and listens on this computer only. What you build is kept in
the browser. **Reset demo** brings back the sample form.
