# formweave

Forms as JSON: one engine for validation, conditions and formulas that runs in the browser and on your server, a
React renderer and web components to show forms, a visual builder, and paper forms read into forms on the device.

Version 0.1: everything here works and is tested; names may still change before 1.0 (see [CHANGELOG.md](CHANGELOG.md)).

## Install

```sh
npm install formweave
```

Only add what you use:

| You use | Also install |
|---|---|
| `formweave` (the engine: schemas, lint, validate, createForm, JSON Schema) | nothing |
| `formweave/react`, `formweave/builder`, `formweave/element` | `react` and `react-dom` (18 or newer) |
| `formweave/scan` | `tesseract.js` (6+), and `pdfjs-dist` (5+) to read PDFs |
| `formweave/samples` | nothing |

| Entry point | What it gives |
|---|---|
| `formweave` | schema types, `lint`, `validate`, `createForm`, `text`, `toJsonSchema`, `fromJsonSchema` |
| `formweave/react` | `<Form>`, `useForm`, `WIDGETS`, `cleanHtml` |
| `formweave/element` | `<formweave-form>` and `<formweave-builder>` for Angular, Vue, Svelte or plain HTML |
| `formweave/builder` | `<Builder>`, `BUILDER_LABELS`, and the schema edits it is made of |
| `formweave/scan` | `scanForm`, `sketchToForm` |
| `formweave/samples` | `SAMPLES`: ready-made forms |
| `formweave/style.css` | the look of forms |
| `formweave/builder.css` | the look of the builder (with `style.css`) |

The package is ESM only, with TypeScript types. Node 20 or newer runs it (checked on 20, 22 and 24 for every change); bundlers (Vite, webpack, Next.js,
Angular) take it as it is. `require('formweave')` works where Node can load ES modules that way (Node 20.19+, 22.12+).

**Network:** formweave sends nothing anywhere by itself, with two exceptions you can turn off. The `map` widget loads
OpenStreetMap tiles (pass your own `mapTiles`), and the first scan downloads Tesseract's engine and language files from
jsDelivr (pass `tesseract: { workerPath, corePath, langPath }` to serve them yourself).

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
- `totals: ['qty', 'total']` on a table adds a Total row that sums those number columns as people type. It is only shown; a formula such as `sum(items.total)` gives the number to your data.
- Matrices (`widget: 'matrix'` with fixed `rows`): a statement per row and the options of the list's first choice field as columns, with a radio in each cell (tick boxes when it allows several). Its other fields follow as ordinary columns, such as a comment. The data is the same as a table's: `[{ rating: 'Good', note: '' }, …]`. On a phone each row becomes a card with its options listed. A scanned table that asks a question per row from one short scale (Yes / No / NA, Poor … Excellent) becomes a matrix.
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
- Looks: `theme: 'paper'` on the schema draws the form like a printed one: a white sheet (also in dark mode) with the title on top, sections boxed under a shaded title band, answers on ruled lines, tables with full grid lines, and only the form when printed. A section's `look` is `'box'`, `'band'` (title on a shaded band) or `'line'` (title underlined), with or without paper.
- Text between fields: `{ type: 'content', as: 'rich', text: '<p><strong>Note:</strong> …</p>' }` keeps bold, italic, lists, links, headings and quotes, and drops anything else (`cleanHtml`). The builder edits it with the rich text toolbar.
- Pictures: `{ type: 'content', as: 'image', src, alt, width }`. `src` is an `https://` address or an inline `data:image/png|jpeg|gif|webp` URL (never svg); `lint()` refuses anything else. `width` is the most pixels wide it is drawn, and it never grows past its column.
- Rich text keeps a text colour too (`<span style="color: #1a7f37">`), and nothing else in `style`.
- A grid's `widths: [1, 4]` sizes its columns once they sit side by side (the second four times the first); phones still stack them. `look: 'lines'` draws lines between the cells and around them, like a table: a label cell beside its text, a picture beside its words, as on printed question sheets.
- `className` on a field, section, grid, pages or content adds classes to just that part. The builder has a "CSS classes" box in every field's and layout part's settings.
- For `<formweave-form>`, set `el.classes = { … }`.
- Your classes are added next to formweave's own `fw-*` classes, so the layout stays responsive. Columns, steps and tabs still follow the form's width. If you want only your own styles, leave out `formweave/style.css`. Columns, the stepper and the tabs then need CSS of your own.
- Headless: `useForm(schema)` gives `{ form, state }` for a UI of your own.

## Build it visually

```tsx
import { Builder } from 'formweave/builder'
import 'formweave/style.css'   // the forms on its canvas and in its panels
import 'formweave/builder.css' // the builder itself
<Builder schema={saved} onChange={(schema, issues) => issues.length || save(schema)} />
```

Or `<formweave-builder>` from `formweave/element`, which fires `fw-change` with `{ schema, issues }`.

- On the canvas, double-click a label, a column heading, a section title or a heading to retype it in place; Enter keeps it, Esc leaves it.
- A choice's options are a list to type into, a line each: value, label (when people should read something else), ↑ and ✕. Enter adds the next one, "Paste a list" takes many at once (`value | label` per line), and "Conditions" adds a "show only when" box per option. "Options per row" breaks radios and tick boxes into that many columns, as on a printed form (`columns: 3`); phones show one. Scanned boxes printed in rows keep their columns.
- **? Help** at the top right opens a short how-to for every part of the builder, in a dialog over it; Esc, ✕ or a click outside closes it.
- The tab bar stays at the top, and the palette and settings stay beside the form while it scrolls; each scrolls on its own when long.
- Copy, Paste and ⧉ Duplicate sit at the top of the settings panel, and Ctrl+C, Ctrl+V and Ctrl+D do the same outside a text box. They take the picked field, column or layout piece (a section comes with every field in it), or the whole form when nothing is picked. A paste lands after what is picked, or inside a picked group or table. Every pasted key is made unique (`email` → `email1`), and formulas and layout among the pasted fields follow the new keys (`qty * price` → `qty1 * price1`); the keys can be changed afterwards like any other. Copies go through the system clipboard, so they paste into another tab or another builder too. In code: `copyPart(schema, part)` and `pasteClip(schema, clip, parent, after, at)` from `formweave/builder`.
- It opens on the Design tab: the form itself, as people will see it. Click a field, a section, a grid, a page or a text on it to change it in the panel beside it; the form updates as you type. Drag anything on it to move it, or drag an input or a layout piece from the palette onto the spot it should go. Fields hidden by "show only when" are shown faded, any step can be opened, and Delete removes what is picked. With nothing picked, the panel holds the form's own settings. Desktop, Tablet and Phone above it draw the form at 1024, 768 or 375 pixels wide (shrunk to fit when the room is smaller), so the columns, steps and tables show as they will on that screen, and you keep editing in any of them. "Full width" puts the palette and the form settings away so the canvas gets all the room; a field's settings still open beside it while it is picked, "+ Add" opens the palette beside it, and Esc brings everything back. `<Form design>` is what draws it, if you build a canvas of your own.
- Pick a table or matrix and the panel shows it as a small table to type into: headings, fixed rows, ← → ↑ ↓ to reorder, ✕ to remove, "+ Column" (pick its type first), "+ Row", "Sum" under number columns, and a switch between fixed rows and rows people add. ⚙ opens a column's own settings. A matrix's columns are its options.
- Add the 8 field types: click one, or drag it from the palette to the spot it should go, groups and lists included. Drag fields or use ↑ ↓ to reorder. A line shows where a drop will land.
- Duplicate, delete, undo and redo (Ctrl+Z, Ctrl+Shift+Z).
- The settings panel is itself a formweave form. It covers key, label, help, required, "show only when", "calculated value", options and limits.
- Renaming or deleting a field keeps the layout pointing at the right keys. `lint()` shows any formula that still uses an old name.
- Preview fills the form for real. The JSON tab copies the schema, or loads one after linting it.
- The Layout tab adds sections, grids (columns per width), pages (steps, tabs, accordion, with the steps at the top, left, right or bottom), headings, text and dividers. "Make it a stepper" turns a form with no layout into one step to split from. Fields are dragged into them, and each part gets its title, columns and "show only when". Fields not placed yet are listed, and removing a container keeps what is inside it.
- Layout pieces, from the palette on the Design tab or from the Layout tab: section (plain, box, title band or underlined), grid (columns per width, column widths such as `1 4`, lines between cells), steps / tabs / accordion, heading, text, rich text (with a colour picker), image (picked from the device and shrunk to 1200 px in the browser, or an https address), divider, and two ready-made grids: "Image beside text" and "Label | text rows".
- The Layout tab's tree marks each line with what it is (section, grid, steps, heading, text, image, and the field's type), tints containers, and cuts long names (the full name shows on hover).
- Still to come: translations and templates.

## Builder looks

The builder is yours to fit into your app: its words, which parts show, and how it looks.

```tsx
<Builder
  schema={saved}
  tabs={['design', 'preview']}                 // which tabs, in this order; the first opens
  palette={['text', 'email', 'phone', 'Choices']} // only these inputs (by key) or groups (by name)
  samples={false}                               // or your own: [{ id, title, about, schema }]
  help={false}                                  // no Help button
  labels={{ design: 'डिज़ाइन', undo: 'पूर्ववत', add: 'जोड़ें' }} // any of BUILDER_LABELS, e.g. another language
  className="my-builder"
  vars={{ '--fw-accent': '#7c3aed', '--fw-b-font': 'Georgia, serif', '--fw-radius': '0', '--fw-b-palette': '16rem', '--fw-b-settings': '26rem' }}
/>
```

`<formweave-builder>` takes the same as properties (`tabs`, `palette`, `samples`, `labels`, `help`, `vars`).

| Variable | What |
|---|---|
| `--fw-accent`, `--fw-text`, `--fw-muted`, `--fw-bg`, `--fw-border`, `--fw-error` | colours of the builder and its panels |
| `--fw-radius` | corners |
| `--fw-b-font` | the builder's font (default: your page's) |
| `--fw-b-palette`, `--fw-b-settings` | widths of the palette and the settings panel |
| `--fw-b-top` | how far below the top the tab bar's sticky panels start (raise it under a fixed app header) |

The form on the canvas keeps its own colours and corners: the `--fw-*` variables, `className` and `classes` you give `<Form>` (see Show it), so what you design is what people get. Its font follows the page around it, as in your app. The palette's group names and the settings panels' own wording are in English for now. The demo's header has accent, font, corner and language controls to try these out.

## Samples

Six ready-made forms show every input and layout piece at work, with made-up names and data:

| Sample | Shows |
|---|---|
| Every input | all inputs of the palette, a section per group |
| Cake order | steps, a field shown only for "Other", cascading town by region, a table with a Total row, calculated tax and total |
| Gym membership | tabs on the left, a name group, plan buttons, dates with limits, a slider, tags, stars, OTP, a signature |
| Garden club survey | an accordion, radios and tick boxes in columns, a rating matrix with a comment column, a percent, rich text |
| Library card | the paper look, a picture beside coloured text, label \| text rows, section looks, a table with fixed rows of tick boxes |
| Kite festival registration | guests as repeating cards, a calculated count, a colour, a map, several photos, markdown |

In the builder: Scan / Import → Samples (Undo brings back your form). In code:

```ts
import { SAMPLES } from 'formweave/samples'
<Form schema={SAMPLES.find((s) => s.id === 'cake-order')!.schema} />
```

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

The built-in widgets and formats. The builder's palette lists 67 ready-made inputs in groups, with a search box. Some are groups of fields: date, time and number ranges (To is checked against From), address, full name and cascading dropdowns. Others are text fields with a pattern: PAN, Aadhaar, GSTIN, IFSC, PIN code and bank account. Any of them can be a column of a table.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for the folders, the checks to run and how to send a change. In short:

```sh
npm install
npm run demo      # the demo app at http://127.0.0.1:5180 (Build and Fill tabs, live reload)
npm test          # unit tests, node:test, Node 22.6+
npm run test:e2e  # the builder in a real browser (Playwright)
npm run test:dist # after build: the built package used by name, on any supported Node
npm run typecheck
npm run build     # dist/ from scratch
```

The demo runs from `src/` through Vite, works offline, and listens on this computer only. What you build is kept in
the browser. **Reset demo** brings back the sample form.

Security: see [SECURITY.md](SECURITY.md). Licence: [MIT](LICENSE).
