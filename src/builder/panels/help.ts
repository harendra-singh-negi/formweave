// How to do each thing in the builder, in a dialog.
import { createElement as h, useEffect, useRef, type MouseEvent } from 'react'

/** How to do each thing in the builder: what the Help button opens. */
export const HELP: [string, string[]][] = [
  [
    'The design canvas',
    [
      'The middle is the form as people will see it. Click a field, column, section, grid, page or text to change it in the panel on the right; the form updates as you type.',
      'Double-click a label, column heading, section title or heading to retype it in place. Enter keeps it, Esc leaves it.',
      'Drag anything on the form to move it. Drag an input or a layout piece from the left onto the spot it should go, or click it to add it after what is picked.',
      'Delete removes what is picked. Undo and Redo (Ctrl+Z, Ctrl+Shift+Z) take back any change.',
      'Copy, Paste and ⧉ Duplicate (Ctrl+C, Ctrl+V, Ctrl+D) work on what is picked: a field, a column, or a section with everything in it. With nothing picked, Copy takes the whole form. Pasted keys are made unique (email → email1) and their formulas follow; change the keys as you like.',
      'Desktop, Tablet and Phone show the form at that screen\'s width, and you keep editing in each. Full width puts the palette and settings away; "+ Add" brings the palette back.',
      "Click empty space on the form to see the form's own settings: its title and its look.",
    ],
  ],
  [
    'Inputs and their settings',
    [
      'The palette on the left has every input, in groups, with a search box. Fields hidden by "Show only when" show faded on the canvas.',
      'Key is the name in the saved data. Required, Read-only, "Show only when" (a formula such as employment == \'Self Employed\') and "Calculated value" (qty * price) are in every input\'s settings.',
    ],
  ],
  [
    'Choices and options',
    [
      'Each option is a line: Value is saved, Label is shown when it should read differently. Enter adds the next option.',
      '"Paste a list" takes many at once, one per line, "value | label" when they differ.',
      '"Options per row" breaks radios and tick boxes into that many columns, like a printed form; phones show one.',
      '"Conditions" adds a "show only when" box to each option, for cascading choices (cities of the picked state).',
    ],
  ],
  [
    'Tables and matrices',
    [
      'Pick a table and its designer opens on the right: type the headings and rows in place, "+ Column" (choose its type first), "+ Row", ← → ↑ ↓ to reorder, ✕ to remove, ⚙ for a column\'s own settings.',
      'Tick "Sum" under a number column for a Total row. "Use fixed rows" names the rows (Monday, Tuesday…); "Let people add rows" lets people add them with "+ Add row".',
      'A matrix (Choices → Matrix) asks a question per row with one choice from the same options, a column each. Its designer edits the rows and the options.',
    ],
  ],
  [
    'Layout: sections, columns, pictures',
    [
      'Layout in the palette adds sections, grids (columns), steps or tabs, headings, text, rich text, images and dividers.',
      "A section's Style is plain, box, a title band or an underlined title.",
      'A grid sets how many columns per screen width, "Column widths" such as 1 4 (the second four times as wide), and "Lines between cells" to draw it like a table. Phones stack the cells.',
      '"Image beside text" and "Label | text rows" are ready-made grids: a picture or a label cell beside text, as on printed question sheets.',
      'Rich text has bold, italic, lists, links, quotes and a text colour (A). An image is picked from this device (made smaller, kept inside the form) or given by its https address.',
      'The Layout tab shows the same layout as a tree, with an icon for each kind of piece, for moving things far apart.',
    ],
  ],
  [
    'Looks, import and saving',
    [
      'Form settings → Look → Paper draws the form like a printed one: title on top, boxed sections, lines to write on, and only the form when printed.',
      'Scan / Import → Samples opens ready-made forms that use every input and layout piece (made-up data), to see how each one works or to start from.',
      'Scan / Import reads a PDF or photos into a form on this device (nothing is uploaded), or takes a pasted schema or JSON Schema.',
      'Every change is passed to your app, with any problems listed at the top; Preview fills the form for real.',
      'The app that shows this builder chooses its colours, font, corners, panel widths, words, tabs and palette (README → Builder looks).',
    ],
  ],
]

/** The how-to, in a modal dialog over the builder: Esc, ✕ or a click outside it closes it. */
export function Help({ close, title, closeLabel }: { close(): void; title: string; closeLabel: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal?.()
  }, [])
  return h(
    'dialog',
    {
      ref,
      id: 'fw-b-help',
      className: 'fw-b-help',
      'aria-labelledby': 'fw-b-help-title',
      onClose: close,
      onClick: (e: MouseEvent) => {
        if (e.target === e.currentTarget) close()
      }, // the backdrop
    },
    h(
      'div',
      { className: 'fw-b-help-head' },
      h('h2', { id: 'fw-b-help-title' }, title),
      h('button', { type: 'button', autoFocus: true, 'aria-label': closeLabel, title: `${closeLabel} (Esc)`, onClick: close }, '✕'),
    ),
    h(
      'div',
      { className: 'fw-b-help-body' },
      HELP.map(([group, items]) =>
        h(
          'section',
          { key: group },
          h('h3', null, group),
          h(
            'ul',
            null,
            items.map((t, i) => h('li', { key: i }, t)),
          ),
        ),
      ),
    ),
  )
}
