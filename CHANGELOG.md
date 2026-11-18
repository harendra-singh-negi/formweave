# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/): before 1.0, a minor version (0.x) may change the API.
From 0.1.0 on, release-please writes this file from the commit messages (see CONTRIBUTING.md).

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

### Samples (`formweave/samples`)

- Six ready-made forms with made-up data that use every input and layout piece.
