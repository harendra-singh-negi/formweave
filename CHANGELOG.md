# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/): before 1.0, a minor version (0.x) may change the API.
From 0.1.0 on, release-please writes this file from the commit messages (see CONTRIBUTING.md).

## [0.2.0](https://github.com/harendra-singh-negi/formweave/compare/formweave-v0.1.0...formweave-v0.2.0) (2026-11-18)


### ⚠ BREAKING CHANGES

* Node 18 is no longer supported.
* apps that show <Builder> import 'formweave/builder.css' as well as 'formweave/style.css'.

### Features

* **builder:** a design canvas: the form itself, click a part to change it, drag to move or add ([08b4de6](https://github.com/harendra-singh-negi/formweave/commit/08b4de60a05768d8fb748f8f04a5b9a0b76eb082))
* **builder:** a full-width canvas ([e8aa1c4](https://github.com/harendra-singh-negi/formweave/commit/e8aa1c4e605362d046a02839bd8834296615c713))
* **builder:** a Help panel, and the README covers every builder feature ([f846d33](https://github.com/harendra-singh-negi/formweave/commit/f846d3373029dafb3d64c5025008108969bbf0ac))
* **builder:** copy, paste and duplicate fields, sections and whole forms ([5e73094](https://github.com/harendra-singh-negi/formweave/commit/5e73094c9a710d7533a08a2738cce9604f550b3c))
* **builder:** drag fields and layout pieces from the palette into place ([926ce61](https://github.com/harendra-singh-negi/formweave/commit/926ce61282480823bd99702271b1241221ddff34))
* **builder:** layout tab for sections, grids, pages and content ([1300957](https://github.com/harendra-singh-negi/formweave/commit/1300957a77bb6bd4318e2bbcfd77d408f6bbc5c3))
* **builder:** open the palette from a full-width canvas ([cb153e6](https://github.com/harendra-singh-negi/formweave/commit/cb153e68be17fe4002abc56f2e97ff4a835c993c))
* **builder:** see and edit the canvas as on a desktop, tablet or phone ([f29cae1](https://github.com/harendra-singh-negi/formweave/commit/f29cae166f76300c7745278006e749a57debfee1))
* **builder:** show the scan import where people look for it ([fa0d227](https://github.com/harendra-singh-negi/formweave/commit/fa0d2276c06ebcc1d889456a3608eadead239d88))
* **builder:** the palette's groups fold like an accordion, under the search box ([4a32f1e](https://github.com/harendra-singh-negi/formweave/commit/4a32f1e668f95d92ef23f4dff0710bbc53613e2a))
* **builder:** visual form builder with a settings panel made of formweave forms ([09fec3d](https://github.com/harendra-singh-negi/formweave/commit/09fec3dea02e598d2241591c50784c34478edf69))
* **builder:** yours to customise: tabs, palette, samples, words, colours, font and panel sizes ([cf835ee](https://github.com/harendra-singh-negi/formweave/commit/cf835eee8907fbc025ef7d1a277c34cdcfa921f8))
* every input in view, grouped and searchable, plus cascading choices and more widgets ([ee2aa4d](https://github.com/harendra-singh-negi/formweave/commit/ee2aa4d744b84074fc4f4255dc723cf1c6e461b1))
* form engine with formulas, validation, lint and a form store ([93e2bf0](https://github.com/harendra-singh-negi/formweave/commit/93e2bf000c7d3dabfc3ead0f46f57ef86211f060))
* images, grids with column widths and lines, coloured text ([d1ac49d](https://github.com/harendra-singh-negi/formweave/commit/d1ac49d0cb689496c41c9f6d01f345aa7a6aa30d))
* **import:** forms from JSON Schema, and JSON Schema of submitted values ([39cf273](https://github.com/harendra-singh-negi/formweave/commit/39cf27344a376bfe0e86adeba5d78368b218f991))
* **list:** tables turn into cards on a phone, and the builder calls a column's label its heading ([0b3ca91](https://github.com/harendra-singh-negi/formweave/commit/0b3ca9191ba07dad5f5cdb7c62946b0a442bb4c6))
* matrices, a table designer, and a total row under tables ([602ee2e](https://github.com/harendra-singh-negi/formweave/commit/602ee2e9448031d26ab6e661af5576e0a2fd5c98))
* options in columns, a compact option list, and labels retyped on the canvas ([eed480c](https://github.com/harendra-singh-negi/formweave/commit/eed480c5806fb5ea5f01a6ed14965a92ce585646))
* **pages:** a real stepper, placed at the top, left, right or bottom ([72fea44](https://github.com/harendra-singh-negi/formweave/commit/72fea44afab62f645c85b597fc6a0d1780af5cd5))
* **react:** Form component, &lt;formweave-form&gt; element, default styles and a demo ([589a040](https://github.com/harendra-singh-negi/formweave/commit/589a04032d023c48e1900d7b5de84dd123831f9a))
* **react:** your own CSS classes, and tabs and accordion that look the part ([b9a6a88](https://github.com/harendra-singh-negi/formweave/commit/b9a6a883674d5ad2b8a23b696c40a8fed1201738))
* rich text and map inputs, unique keys said on the spot, a tidier palette accordion ([cd1b86d](https://github.com/harendra-singh-negi/formweave/commit/cd1b86d1b62abc78f34208f8f2dfc1eaa309a2a2))
* rich text blocks, section looks and a paper theme ([7bed72e](https://github.com/harendra-singh-negi/formweave/commit/7bed72e931c55a86c3a22f801caf3c1d75e43349))
* **scan:** forms from photos, scans and PDFs, read on the device with OCR; one demo app on Vite ([735e334](https://github.com/harendra-singh-negi/formweave/commit/735e334331807e30767f75cae9d7750afb363408))
* **scan:** read real forms: fields side by side, box grids, rating matrices, tables across pages, and the PDF's own words ([c2a0b1b](https://github.com/harendra-singh-negi/formweave/commit/c2a0b1b2e9d8551d04fa1cbc5f187bfb2a53a534))
* six sample forms that use every input and layout piece ([187185d](https://github.com/harendra-singh-negi/formweave/commit/187185d76533a5f5245bbee1ef62be0ce623a642))
* tables with fixed rows, and 32 ready-made inputs in the builder ([a760c95](https://github.com/harendra-singh-negi/formweave/commit/a760c95537edcb231ba6bd1fda84c5753443ad47))
* the builder's styles in their own file, formweave/builder.css ([fee8dfd](https://github.com/harendra-singh-negi/formweave/commit/fee8dfd4c7ee79053f9fc57817442327d71b6992))


### Bug Fixes

* **builder:** buttons with words are named by their words ([b46bafb](https://github.com/harendra-singh-negi/formweave/commit/b46bafbceed83a90b24b552ad815305d8ecce585))
* **builder:** help opens in a dialog over the builder ([cec2118](https://github.com/harendra-singh-negi/formweave/commit/cec2118d4ccdc50232d6002cdd9bd61149d7729b))
* **builder:** the bar, palette and settings stay put while the form scrolls; a readable layout tree ([1a76e55](https://github.com/harendra-singh-negi/formweave/commit/1a76e553e9402a80aedb9af05dba0f61434923a4))
* **demo:** the built demo keeps its custom elements ([59bce83](https://github.com/harendra-singh-negi/formweave/commit/59bce838fcf2a9c5e8c666cabf0b9ec9b96278b4))
* element imports on a server, scan types without pdfjs-dist, package.json exported ([a1a7a5d](https://github.com/harendra-singh-negi/formweave/commit/a1a7a5d1cd5f17b931dd3f2e22c21aefd8956935))
* **element:** each element gets its own id prefix, so two on a page never share ids ([a3bb704](https://github.com/harendra-singh-negi/formweave/commit/a3bb704276a3494e611cbd2216fd14a2108cd86c))
* **list:** tables and lists look different, and the builder says how to add columns and rows ([41607d8](https://github.com/harendra-singh-negi/formweave/commit/41607d8415a1acb09535eac8bc0b278cbfdd1a15))
* **react:** a switch looks like a switch ([13082e3](https://github.com/harendra-singh-negi/formweave/commit/13082e3e013f309f58af86c8ec9ef5e7a6b29cea))


### Build System

* Node 20 or newer, and a check of the built package on any Node ([dfe3281](https://github.com/harendra-singh-negi/formweave/commit/dfe3281f32c7b3301f44035d6335a2c7a7baaedd))

## 0.1.0 (2026-11-18)

The first release.

### Engine (`formweave`)

- Forms as JSON: text, number, yes / no, choice, date, file, group and list fields, with labels in several languages.
- Formulas without eval: calculated values, "show only when", read-only and required conditions, checks across fields,
  cascading options; `sum`, `avg`, `count`, `round`, `if`, `days` and more.
- `lint()` finds every mistake in a schema; `validate()` checks answers on a server the same way the form does;
  `createForm()` is a live form store for any UI.
- JSON Schema in and out (OpenAPI, Zod).

### Showing forms (`formweave/react`, `formweave/element`)

- `<Form>` and `useForm()`, and `<formweave-form>` for other frameworks; server rendering works.
- 67 ready-made inputs: phone with country code, OTP, signature, map, barcode, rich text, stepper, slider, stars, tags,
  autocomplete, buttons, files and camera, IDs such as PAN, IFSC and GSTIN.
- Sections, grids with column widths and lines between cells, steps, tabs and accordions, headings, rich text with
  colour, images; tables with fixed rows and totals; matrices; options in columns.
- A paper look for printed-style forms; your own classes, CSS variables, words and widgets.

### Builder (`formweave/builder`)

- A design canvas: the form as people will see it at desktop, tablet or phone width; click to edit, drag to move or add,
  double-click to retype a label, full-width mode.
- Copy, paste and duplicate of fields, sections and whole forms, with unique keys and formulas that follow.
- A table and matrix designer, a compact option editor, an image picker, a layout tree, undo and redo, help.
- Its tabs, palette, samples, words, colours, font and panel sizes are set by the app.

### Scanning (`formweave/scan`)

- Photos, scans and PDFs read into a form on the device with OCR and geometry: no AI service, nothing uploaded.

### Package

- ESM with TypeScript types; Node 20 or newer; React 18 or newer for the React parts. MIT licence.

### Samples (`formweave/samples`)

- Six ready-made forms with made-up data that use every input and layout piece.
