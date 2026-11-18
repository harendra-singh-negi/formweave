// Ready-made forms that show every input and every layout piece at work. All names and data are made up.
// Load one into the builder (Scan / Import → Samples) or render it: <Form schema={SAMPLES[0].schema} />.
import { PALETTE } from './palette.ts'
import type { Fields, FormSchema, Layout } from './schema.ts'

export interface Sample {
  id: string
  title: string
  /** What it shows off. */
  about: string
  schema: FormSchema
}

/** A small open book, drawn for these samples. */
const BOOK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAA10lEQVR42u3asQ2FMAwEUOagYRJWYR5mYSsmoKeBCiEEQSFxbOc4S26/7omA+DZNwzprXtYtpqsM7Q6TG9wMIh1cDVI6eFGIdnhRhFV4EYR1+CyEl/BJCG/hPyOqBqT+eDtMtz6qG/tbF0OkBA31GyDUWQCJ0LmAGAwmQOrYaAAeEb8BxFQIEFNJAMknj9YVuCAIqAng5R7gESKA9wCPkCMA34Ws34UgrgD/kXkAhBCeANXOhFRmQ5zMIc9H/zdeh1hwQKyYIJZ8EGtWmEU3zKcGMB97WNcOzVrlM6t6tCsAAAAASUVORK5CYII='

/** Every input of the palette, a section per group, two columns. */
function everyInput(): FormSchema {
  const fields: Fields = {}
  const layout: Layout[] = PALETTE.map(([group, items]) => {
    for (const [key, , f] of items) fields[key] = structuredClone(f)
    return { type: 'section', title: group, look: 'line', children: [{ type: 'grid', cols: { base: 1, md: 2 }, children: items.map(([key]) => key) }] }
  })
  return { version: 1, title: 'Every input', fields, layout }
}

export const SAMPLES: Sample[] = [
  {
    id: 'every-input',
    title: 'Every input',
    about: `All ${PALETTE.reduce((n, [, items]) => n + items.length, 0)} inputs of the palette, a section per group: text, numbers, choices, dates, files, signature, map, IDs, tables…`,
    schema: everyInput(),
  },
  {
    id: 'cake-order',
    title: 'Cake order (steps, formulas, conditions)',
    about: 'A three-step order: a delivery address only when delivery is picked, cascading town by region, a table that adds itself up, a total with tax.',
    schema: {
      version: 1,
      title: 'Cake order',
      fields: {
        customer: { type: 'string', label: 'Your name', required: true, minLength: 2 },
        mobile: { type: 'string', widget: 'phone', format: 'phone', country: 'IN', label: 'Mobile', required: true },
        occasion: { type: 'choice', widget: 'buttons', label: 'Occasion', options: ['Birthday', 'Wedding', 'Office', 'Other'], required: true },
        occasionOther: { type: 'string', label: 'Which occasion?', visible: "occasion == 'Other'", required: true },
        items: { type: 'list', widget: 'table', label: 'Cakes', min: 1, max: 6, totals: ['qty', 'amount'], fields: {
          flavour: { type: 'choice', widget: 'select', label: 'Flavour', options: ['Chocolate truffle', 'Mango cream', 'Red velvet', 'Pineapple'], required: true },
          size: { type: 'choice', widget: 'select', label: 'Size', options: ['0.5 kg', '1 kg', '2 kg'], required: true },
          qty: { type: 'number', widget: 'stepper', label: 'Qty', min: 1, max: 20, decimals: 0, default: 1 },
          rate: { type: 'number', format: 'currency', currency: 'INR', label: 'Rate', decimals: 2, min: 0, required: true },
          amount: { type: 'number', format: 'currency', currency: 'INR', label: 'Amount', value: 'qty * rate', decimals: 2 },
        } },
        message: { type: 'string', label: 'Words on the cake', maxLength: 40, help: 'Up to 40 letters.' },
        eggless: { type: 'boolean', widget: 'toggle', label: 'Eggless' },
        tax: { type: 'number', format: 'currency', currency: 'INR', label: 'GST 5%', value: 'round(sum(items.amount) * 5 / 100, 2)', decimals: 2 },
        grandTotal: { type: 'number', format: 'currency', currency: 'INR', label: 'To pay', value: 'sum(items.amount) + tax', decimals: 2 },
        handover: { type: 'choice', widget: 'radio', label: 'Pick up or delivery', options: ['Pick up at the shop', 'Deliver it'], required: true, columns: 2 },
        region: { type: 'choice', widget: 'select', label: 'Region', options: ['Hill side', 'Lake side'], visible: "handover == 'Deliver it'", required: true },
        town: { type: 'choice', widget: 'select', label: 'Town', visible: "handover == 'Deliver it'", required: true, options: [
          { value: 'Pinegrove', visible: "region == 'Hill side'" }, { value: 'Cedar Point', visible: "region == 'Hill side'" },
          { value: 'Bluewater', visible: "region == 'Lake side'" }, { value: 'Reedsville', visible: "region == 'Lake side'" },
        ] },
        address: { type: 'string', widget: 'textarea', label: 'Address', visible: "handover == 'Deliver it'", required: true },
        when: { type: 'date', format: 'datetime', label: 'Ready by', required: true },
        photo: { type: 'file', label: 'A picture of a design you like', accept: 'image/*' },
        agree: { type: 'boolean', label: 'I have checked the order', required: true },
      },
      layout: [{ type: 'pages', display: 'steps', children: [
        { type: 'section', title: 'You', children: [{ type: 'grid', cols: { base: 1, md: 2 }, children: ['customer', 'mobile'] }, 'occasion', 'occasionOther'] },
        { type: 'section', title: 'Cakes', children: ['items', { type: 'grid', cols: { base: 1, md: 2 }, children: ['message', 'eggless'] }, 'photo', { type: 'grid', cols: { base: 1, md: 2 }, children: ['tax', 'grandTotal'] }] },
        { type: 'section', title: 'Handover', children: ['handover', { type: 'grid', cols: { base: 1, md: 2 }, children: ['region', 'town'] }, 'address', 'when', 'agree'] },
      ] }],
    },
  },
  {
    id: 'gym-membership',
    title: 'Gym membership (tabs, dates, signature)',
    about: 'Tabs on the left: plan buttons, a start date that must not be in the past, fitness goals as tags, a body rating slider, OTP and a drawn signature.',
    schema: {
      version: 1,
      title: 'Gym membership',
      fields: {
        name: { type: 'group', label: 'Name', fields: { first: { type: 'string', label: 'First name', required: true }, last: { type: 'string', label: 'Last name' } } },
        email: { type: 'string', format: 'email', label: 'Email', required: true },
        born: { type: 'date', label: 'Date of birth', max: '2010-12-31' },
        plan: { type: 'choice', widget: 'buttons', label: 'Plan', options: ['Monthly', 'Quarterly', 'Yearly'], required: true },
        start: { type: 'date', label: 'Start on', min: '2026-01-01', required: true },
        sessions: { type: 'number', widget: 'slider', label: 'Visits a week', min: 1, max: 7, decimals: 0, default: 3 },
        goals: { type: 'choice', widget: 'tags', multiple: true, allowOther: true, label: 'Goals', options: ['Strength', 'Stamina', 'Flexibility', 'Weight'] },
        trainer: { type: 'boolean', widget: 'toggle', label: 'Personal trainer' },
        trainerTime: { type: 'date', format: 'time', label: 'Preferred time', visible: 'trainer' },
        fitness: { type: 'number', widget: 'rating', label: 'How fit do you feel?', min: 1, max: 5, decimals: 0 },
        conditions: { type: 'string', widget: 'textarea', label: 'Anything we should know about your health?' },
        code: { type: 'string', widget: 'otp', label: 'Code sent to your email', minLength: 6, maxLength: 6, pattern: '[0-9]*', messages: { pattern: 'Digits only' } },
        signature: { type: 'string', widget: 'signature', label: 'Sign here', required: true },
      },
      layout: [{ type: 'pages', display: 'tabs', position: 'left', children: [
        { type: 'section', title: 'About you', children: ['name', { type: 'grid', cols: { base: 1, md: 2 }, children: ['email', 'born'] }] },
        { type: 'section', title: 'Plan', children: ['plan', { type: 'grid', cols: { base: 1, md: 2 }, children: ['start', 'sessions'] }, 'goals', { type: 'grid', cols: { base: 1, md: 2 }, children: ['trainer', 'trainerTime'] }] },
        { type: 'section', title: 'Health', children: ['fitness', 'conditions'] },
        { type: 'section', title: 'Sign', children: ['code', 'signature'] },
      ] }],
    },
  },
  {
    id: 'garden-survey',
    title: 'Garden club survey (matrix, columns, accordion)',
    about: 'An accordion: a rating matrix with a comment column, tick boxes in three columns, a percent, stars and a long answer.',
    schema: {
      version: 1,
      title: 'Garden club survey',
      fields: {
        visits: { type: 'choice', widget: 'radio', label: 'How often do you come?', options: ['Every week', 'Every month', 'Now and then', 'First time'], columns: 2, required: true },
        grow: { type: 'choice', multiple: true, label: 'What do you grow?', columns: 3, options: ['Tomatoes', 'Chillies', 'Marigolds', 'Spinach', 'Mint', 'Roses', 'Beans', 'Basil', 'Sunflowers'] },
        rate: { type: 'list', widget: 'matrix', label: 'Rate the garden', rowHeading: 'Part', rows: ['Paths', 'Water taps', 'Tool shed', 'Compost bins'], fields: {
          score: { type: 'choice', label: 'Rating', options: ['Poor', 'Fair', 'Good', 'Great'], required: true },
          note: { type: 'string', label: 'Comment' },
        } },
        shade: { type: 'number', format: 'percent', label: 'How much of your plot is in shade?', min: 0, max: 100 },
        overall: { type: 'number', widget: 'rating', label: 'Overall', min: 1, max: 5, decimals: 0 },
        ideas: { type: 'string', widget: 'richtext', label: 'Ideas for next season' },
      },
      layout: [{ type: 'pages', display: 'accordion', children: [
        { type: 'section', title: 'You and your plot', children: ['visits', 'grow', 'shade'] },
        { type: 'section', title: 'The garden', children: ['rate', 'overall'] },
        { type: 'section', title: 'Next season', children: ['ideas'] },
      ] }],
    },
  },
  {
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
  },
  {
    id: 'event-registration',
    title: 'Event registration (repeating cards, groups, map)',
    about: 'Plain one-page form: guests added as cards, an address group, a venue picked on a map, files, a colour, and a calculated count.',
    schema: {
      version: 1,
      title: 'Kite festival registration',
      fields: {
        team: { type: 'string', label: 'Team name', required: true },
        contact: { type: 'string', format: 'email', label: 'Contact email', required: true },
        guests: { type: 'list', label: 'People coming', min: 1, max: 8, fields: {
          name: { type: 'string', label: 'Name', required: true },
          age: { type: 'number', label: 'Age', min: 1, max: 110, decimals: 0 },
          meal: { type: 'choice', widget: 'buttons', label: 'Lunch', options: ['Veg', 'Non-veg', 'None'] },
        } },
        headcount: { type: 'number', label: 'People in all', value: 'count(guests.name)', decimals: 0 },
        kiteColour: { type: 'string', format: 'color', label: 'Kite colour' },
        spot: { type: 'string', widget: 'map', label: 'Where you will set up', pattern: '-?\\d{1,2}(\\.\\d+)?, ?-?\\d{1,3}(\\.\\d+)?', messages: { pattern: 'Like 12.9716,77.5946' } },
        photos: { type: 'file', label: 'Photos of last year\'s kite', accept: 'image/*', multiple: true, max: 3 },
        notes: { type: 'string', widget: 'markdown', label: 'Notes', help: 'Markdown: **bold**, _italic_, - lists' },
      },
      layout: [
        { type: 'content', as: 'heading', text: 'Kite festival, 14 January' },
        { type: 'content', as: 'rich', text: '<p>Teams of up to 8. Lunch is served at <strong>1 pm</strong>.</p>' },
        { type: 'grid', cols: { base: 1, md: 2 }, children: ['team', 'contact'] },
        { type: 'content', as: 'divider' },
        'guests', 'headcount',
        { type: 'section', title: 'Your kite', look: 'box', children: [{ type: 'grid', cols: { base: 1, md: 3 }, widths: [1, 2, 2], children: ['kiteColour', 'photos', 'notes'] }, 'spot'] },
      ],
    },
  },
]
