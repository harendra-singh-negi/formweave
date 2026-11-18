# Security

## Reporting a problem

Please don't open a public issue for a security problem. Write to the maintainer privately (see the `author` in
package.json, or the repository's security advisories when it has them), with what you found and how to see it.
You'll get an answer within a week.

## What formweave does to stay safe

- Formulas are parsed and evaluated by formweave itself, never with `eval` or `Function`.
- `lint()` checks every schema; `createForm()` and `<Form>` refuse one that fails it. Patterns are limited in length,
  and the built-in formats run in linear time.
- Rich text, from a schema or typed by people, keeps only plain formatting (`cleanHtml`): no scripts, no event
  attributes, links only to http, https and mailto, styles only a text colour.
- Pictures in a schema are https addresses or inline png, jpeg, gif or webp, never svg.
- Scanning runs on the device; nothing is uploaded.

## What your app must still do

- Check answers on your server with `validate()`: anything in a browser can be changed.
- Run your own sanitizer (such as DOMPurify) on rich text on the server too, before showing it elsewhere.
- Store uploaded files yourself, behind your own checks: formweave only sees the reference your `onUpload` returns.
