// Sample: Library card (paper look, image beside text). Made-up data.
import type { Sample } from './types.ts'
import { BOOK } from './book-picture.ts'

export const libraryCard: Sample = {
  id: 'library-card',
  title: 'Library card (paper look, image beside text)',
  about: 'Printed-form look: title on top, a picture beside rich text, label | text rows, sections with a title band, a box and an underline, a table with fixed rows.',
  schema: {
    version: 1,
    title: 'Riverside Library card request',
    theme: 'paper',
    fields: {
      fullName: { type: 'string', label: 'Full name', required: true },
      born: { type: 'date', label: 'Date of birth', required: true },
      address: { type: 'group', label: 'Address', fields: {
        line1: { type: 'string', label: 'House and street', required: true },
        town: { type: 'string', label: 'Town', required: true },
        pin: { type: 'string', label: 'PIN code', pattern: '[1-9]\\d{5}', placeholder: '560001', messages: { pattern: 'Six digits' } },
      } },
      card: { type: 'choice', widget: 'radio', label: 'Card', options: [{ value: 'adult', label: 'Adult (up to 6 books)' }, { value: 'young', label: 'Young reader (up to 3 books)' }, { value: 'family', label: 'Family (up to 10 books)' }], columns: 3, required: true },
      topics: { type: 'choice', multiple: true, label: 'Topics you like', columns: 3, options: ['Stories', 'Science', 'History', 'Comics', 'Cooking', 'Travel'] },
      hours: { type: 'list', widget: 'table', label: 'When you can visit', rowHeading: 'Day', rows: ['Monday', 'Wednesday', 'Saturday'], fields: {
        morning: { type: 'boolean', label: 'Morning' }, evening: { type: 'boolean', label: 'Evening' },
      } },
      signature: { type: 'string', widget: 'signature', label: 'Signature', required: true },
      signed: { type: 'date', label: 'Date', required: true },
    },
    layout: [
      { type: 'grid', cols: { base: 1, md: 2 }, widths: [1, 6], look: 'lines', children: [
        { type: 'content', as: 'image', src: BOOK, alt: 'An open book', width: 48 },
        { type: 'content', as: 'rich', text: '<p>A card is <strong>free</strong> for everyone living in the district. Bring <span style="color: #1a7f37">one proof of address</span> when you collect it.</p>' },
      ] },
      { type: 'grid', cols: { base: 1, md: 2 }, widths: [1, 3], look: 'lines', children: [
        { type: 'content', as: 'heading', text: 'Who can apply' }, { type: 'content', as: 'rich', text: '<p>Anyone aged 5 or more. Under 12s need a parent to sign.</p>' },
        { type: 'content', as: 'heading', text: 'How long' }, { type: 'content', as: 'rich', text: '<p>Cards are ready in <em>three working days</em>.</p>' },
      ] },
      { type: 'section', title: 'Applicant', look: 'band', children: [{ type: 'grid', cols: { base: 1, md: 2 }, children: ['fullName', 'born'] }, 'address'] },
      { type: 'section', title: 'Your card', look: 'box', children: ['card', 'topics', 'hours'] },
      { type: 'section', title: 'Declaration', look: 'line', children: [
        { type: 'content', as: 'text', text: 'I will look after the books I borrow and return them on time.' },
        { type: 'grid', cols: { base: 1, md: 2 }, children: ['signature', 'signed'] },
      ] },
    ],
  },
}
