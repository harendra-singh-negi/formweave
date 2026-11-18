# Contributing to formweave

Thank you for helping. This page says where things are, how to check a change, and how to send it.

## Set up

```sh
npm install
npx playwright install chromium   # once, for the browser tests
npm run demo                      # http://127.0.0.1:5180: build a form, fill it in
```

## Where things are

```
src/
  index.ts  react.ts  builder.ts  scan.ts  samples.ts  element.ts   the package's entry points: re-exports only
  core/       the engine, no DOM and no dependencies
    schema.ts       the schema's types and formats: start here
    expr.ts         formulas: parsed once, evaluated without eval
    lint.ts         every check on a schema
    form.ts         createForm() and validate(); run.ts, checks.ts and values.ts do the work
    jsonschema.ts   JSON Schema in and out
  react/      showing a form with React
    form.ts  context.ts  layout.ts  shell.ts
    widgets/        one file per kind of input; index.ts lists them
  builder/    the visual builder
    builder.ts      state, history, tabs; canvas.ts the design canvas
    schema-edits.ts  layout-edits.ts  clipboard.ts   pure functions, unit tested
    settings/  panels/  tabs/   the settings forms, the side panels, the other tabs
    palette.ts      every ready-made input
  scan/       paper forms read on the device
    scan-form.ts  sketch-to-form.ts
    vision/         pixels, shapes, words, read-page, to-sketch
  samples/    one file per sample form
  styles/     form.css (forms) and builder.css (the builder), shipped as style.css and builder.css
test/         unit tests (node:test), one file per area
e2e/          the builder in a real browser (Playwright)
demo/         the demo app (Vite)
scripts/      build.mjs, and scan-pdf.ts to compare scanning across PDFs
```

Keep files small and about one thing. A new widget is a file in `src/react/widgets/` plus a line in its `index.ts`;
a new sample is a file in `src/samples/` plus a line in `src/samples.ts`. Every file starts with a line on what it is for.

## Editor

The Prettier and oxc (oxlint) extensions show the same results while you type; `.editorconfig` sets the spacing.
A rule that must not apply in one place is turned off on that line with its reason:
`// oxlint-disable-next-line rule -- why`.

## Rules of the house

- No AI service, account or paid API anywhere: the people who fill in these forms have none.
- No new runtime dependencies. React, tesseract.js and pdf.js stay optional peers.
- The engine (`src/core`) runs without a DOM: it is used on servers.
- Formulas never use `eval` or `Function`. HTML from a schema or a user goes through `cleanHtml`; pictures only as
  https or inline png / jpeg / gif / webp.
- Anything new is shown in the demo or a sample, in the builder's Help when it is a builder feature, and in the README.
- Sample data is made up.

## Check a change

```sh
npm run format       # Prettier writes the code style; format:check only checks
npm run lint         # oxlint: mistakes, unused code, the rules of hooks; warnings fail too
npm run typecheck
npm test
npm run test:e2e
npm run build && npm run test:dist    # the built package, used by name as an app would
npm pack --dry-run                    # what would be published
```

For scanning changes, compare before and after on a set of PDFs: `node --experimental-strip-types scripts/scan-pdf.ts a.pdf b.pdf`.

## Continuous integration

Every push to `main` and every pull request runs `.github/workflows/ci.yml`: lint, the Prettier check, the type check, unit tests, build, package
check and browser tests on Node 22, and the built package on Node 20, 22 and 24. A pull request is merged when it is
green.

## Send it

- One change per commit, with a [Conventional Commit](https://www.conventionalcommits.org/) message: `feat(builder): …`,
  `fix(react): …`, `docs: …`, `refactor: …`, `test: …`, `chore: …`. A change that breaks an API adds `!` and a
  `BREAKING CHANGE:` line.
- These messages make the changelog and the next version (release-please): `fix` → patch, `feat` → minor, `!` → major
  (minor before 1.0).

## Releasing (maintainers)

release-please opens a release pull request from the commits on `main`; merging it tags the version and updates
CHANGELOG.md and package.json. Then `npm publish` (it builds, type-checks and tests first).
