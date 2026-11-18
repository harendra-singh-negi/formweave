// Sample: Event registration (repeating cards, groups, map). Made-up data.
import type { Sample } from './types.ts'

export const eventRegistration: Sample = {
  id: 'event-registration',
  title: 'Event registration (repeating cards, groups, map)',
  about: 'Plain one-page form: guests added as cards, an address group, a venue picked on a map, files, a colour, and a calculated count.',
  schema: {
    version: 1,
    title: 'Kite festival registration',
    fields: {
      team: { type: 'string', label: 'Team name', required: true },
      contact: { type: 'string', format: 'email', label: 'Contact email', required: true },
      guests: {
        type: 'list',
        label: 'People coming',
        min: 1,
        max: 8,
        fields: {
          name: { type: 'string', label: 'Name', required: true },
          age: { type: 'number', label: 'Age', min: 1, max: 110, decimals: 0 },
          meal: { type: 'choice', widget: 'buttons', label: 'Lunch', options: ['Veg', 'Non-veg', 'None'] },
        },
      },
      headcount: { type: 'number', label: 'People in all', value: 'count(guests.name)', decimals: 0 },
      kiteColour: { type: 'string', format: 'color', label: 'Kite colour' },
      spot: {
        type: 'string',
        widget: 'map',
        label: 'Where you will set up',
        pattern: '-?\\d{1,2}(\\.\\d+)?, ?-?\\d{1,3}(\\.\\d+)?',
        messages: { pattern: 'Like 12.9716,77.5946' },
      },
      photos: { type: 'file', label: "Photos of last year's kite", accept: 'image/*', multiple: true, max: 3 },
      notes: { type: 'string', widget: 'markdown', label: 'Notes', help: 'Markdown: **bold**, _italic_, - lists' },
    },
    layout: [
      { type: 'content', as: 'heading', text: 'Kite festival, 14 January' },
      { type: 'content', as: 'rich', text: '<p>Teams of up to 8. Lunch is served at <strong>1 pm</strong>.</p>' },
      { type: 'grid', cols: { base: 1, md: 2 }, children: ['team', 'contact'] },
      { type: 'content', as: 'divider' },
      'guests',
      'headcount',
      {
        type: 'section',
        title: 'Your kite',
        look: 'box',
        children: [{ type: 'grid', cols: { base: 1, md: 3 }, widths: [1, 2, 2], children: ['kiteColour', 'photos', 'notes'] }, 'spot'],
      },
    ],
  },
}
