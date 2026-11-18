// Every ready-made input of the builder's palette, in groups: [key to use, name, the field]. No React here, so samples can use it.
import type { Field } from './schema.ts'

type Kind = Field['type']

const NEW: Record<Kind, () => Field> = {
  string: () => ({ type: 'string', label: 'Text' }),
  number: () => ({ type: 'number', label: 'Number' }),
  boolean: () => ({ type: 'boolean', label: 'Yes / No' }),
  choice: () => ({ type: 'choice', label: 'Choice', options: ['Option 1', 'Option 2'] }),
  date: () => ({ type: 'date', label: 'Date' }),
  file: () => ({ type: 'file', label: 'File' }),
  group: () => ({ type: 'group', label: 'Group', fields: {} }),
  list: () => ({ type: 'list', label: 'List', widget: 'table', min: 1, fields: {} }),
}
/** Every input, ready-made and grouped, so people find a radio group or a signature pad without knowing the settings behind it. */
const opts2 = ['Option 1', 'Option 2']
const range = (f: Field, label: string): Field => ({ type: 'group', label, fields: {
  from: { ...f, label: 'From' } as Field,
  to: { ...f, label: 'To', check: 'empty(from) or empty(to) or to >= from', messages: { check: 'Must not be before From' } } as Field,
} })
const id = (label: string, pattern: string, example: string): Field => ({ type: 'string', label, pattern, placeholder: example, messages: { pattern: `Like ${example}` } })
export const PALETTE: [string, [string, string, Field][]][] = [
  ['Text', [
    ['text', 'Short text', { type: 'string', label: 'Text' }],
    ['longText', 'Long text', { type: 'string', label: 'Long text', widget: 'textarea' }],
    ['email', 'Email', { type: 'string', label: 'Email', format: 'email' }],
    ['phone', 'Phone', { type: 'string', label: 'Phone', format: 'phone' }],
    ['intlPhone', 'Phone + country code', { type: 'string', label: 'Phone', widget: 'phone', format: 'phone', country: 'IN' }],
    ['website', 'Website', { type: 'string', label: 'Website', format: 'url' }],
    ['password', 'Password', { type: 'string', label: 'Password', widget: 'password' }],
    ['search', 'Search', { type: 'string', label: 'Search', widget: 'search' }],
  ]],
  ['Numbers', [
    ['number', 'Number', { type: 'number', label: 'Number' }],
    ['stepper', 'Number with − / +', { type: 'number', label: 'Quantity', widget: 'stepper', min: 0, decimals: 0 }],
    ['amount', 'Amount (₹)', { type: 'number', label: 'Amount', format: 'currency', currency: 'INR', decimals: 2, min: 0 }],
    ['percent', 'Percent', { type: 'number', label: 'Percent', format: 'percent', min: 0, max: 100 }],
    ['slider', 'Slider', { type: 'number', label: 'Slider', widget: 'slider', min: 0, max: 100 }],
    ['numberRange', 'Number range', range({ type: 'number' }, 'Range')],
    ['rating', 'Rating (stars)', { type: 'number', label: 'Rating', widget: 'rating', min: 1, max: 5, decimals: 0 }],
  ]],
  ['Choices', [
    ['radio', 'Radio group', { type: 'choice', label: 'Pick one', widget: 'radio', options: opts2 }],
    ['checkboxes', 'Checkbox group', { type: 'choice', label: 'Pick any', multiple: true, options: opts2 }],
    ['dropdown', 'Dropdown', { type: 'choice', label: 'Dropdown', widget: 'select', options: opts2 }],
    ['multiSelect', 'Multi-select dropdown', { type: 'choice', label: 'Pick several', multiple: true, widget: 'select', options: opts2 }],
    ['buttonGroup', 'Button group', { type: 'choice', label: 'Pick one', widget: 'buttons', options: ['Low', 'Medium', 'High'] }],
    ['yesNo', 'Yes / No buttons', { type: 'choice', label: 'Yes or no', widget: 'buttons', options: ['Yes', 'No'] }],
    ['checkbox', 'Single checkbox', { type: 'boolean', label: 'I agree' }],
    ['toggle', 'Switch', { type: 'boolean', label: 'Switch', widget: 'toggle' }],
    ['autocomplete', 'Autocomplete', { type: 'choice', label: 'Search and pick', widget: 'autocomplete', options: opts2 }],
    ['tags', 'Tags', { type: 'choice', label: 'Tags', widget: 'tags', multiple: true, allowOther: true, options: ['Urgent', 'Follow up'] }],
    ['country', 'Country', { type: 'string', label: 'Country', format: 'country' }],
    ['matrix', 'Matrix (rate each row)', { type: 'list', label: 'Rate each', widget: 'matrix', rows: ['Quality', 'Speed', 'Support'], fields: { rating: { type: 'choice', label: 'Rating', options: ['Poor', 'Fair', 'Good', 'Excellent'] } } }],
    ['cascading', 'Cascading dropdowns', { type: 'group', label: 'Place', fields: {
      state: { type: 'choice', label: 'State', widget: 'select', options: ['Maharashtra', 'Karnataka'] },
      city: { type: 'choice', label: 'City', widget: 'select', options: [
        { value: 'Mumbai', visible: "state == 'Maharashtra'" }, { value: 'Pune', visible: "state == 'Maharashtra'" },
        { value: 'Bengaluru', visible: "state == 'Karnataka'" }, { value: 'Mysuru', visible: "state == 'Karnataka'" },
      ] },
    } }],
  ]],
  ['Date & time', [
    ['date', 'Date', { type: 'date', label: 'Date' }],
    ['time', 'Time', { type: 'date', label: 'Time', format: 'time' }],
    ['dateTime', 'Date & time', { type: 'date', label: 'Date & time', format: 'datetime' }],
    ['dateRange', 'Date range', range({ type: 'date' }, 'Dates')],
    ['timeRange', 'Time range', range({ type: 'date', format: 'time' }, 'Times')],
    ['month', 'Month', { type: 'date', label: 'Month', format: 'month' }],
    ['week', 'Week', { type: 'date', label: 'Week', format: 'week' }],
    ['year', 'Year', { type: 'date', label: 'Year', format: 'year' }],
  ]],
  ['Files', [
    ['file', 'File', { type: 'file', label: 'File' }],
    ['images', 'Images', { type: 'file', label: 'Images', accept: 'image/*', multiple: true }],
    ['photo', 'Photo / camera', { type: 'file', label: 'Photo', widget: 'camera', accept: 'image/*' }],
    ['document', 'Document', { type: 'file', label: 'Document', accept: '.pdf,.doc,.docx,.xls,.xlsx' }],
    ['video', 'Video', { type: 'file', label: 'Video', accept: 'video/*' }],
    ['audio', 'Audio', { type: 'file', label: 'Audio', accept: 'audio/*' }],
  ]],
  ['Advanced', [
    ['richText', 'Rich text', { type: 'string', label: 'Description', widget: 'richtext' }],
    ['map', 'Map location', { type: 'string', label: 'Location', widget: 'map', pattern: '-?\\d{1,2}(\\.\\d+)?, ?-?\\d{1,3}(\\.\\d+)?', messages: { pattern: 'Like 28.6139,77.2090' } }],
    ['signature', 'Signature', { type: 'string', label: 'Signature', widget: 'signature' }],
    ['otp', 'OTP / code', { type: 'string', label: 'OTP', widget: 'otp', minLength: 6, maxLength: 6, pattern: '[0-9]*', messages: { pattern: 'Digits only' } }],
    ['location', 'Location', { type: 'string', label: 'Location', widget: 'location', pattern: '-?\\d{1,2}(\\.\\d+)?, ?-?\\d{1,3}(\\.\\d+)?', messages: { pattern: 'Like 28.6139,77.2090' } }],
    ['barcode', 'QR / barcode', { type: 'string', label: 'Code', widget: 'barcode' }],
    ['color', 'Colour', { type: 'string', label: 'Colour', format: 'color' }],
    ['markdown', 'Markdown', { type: 'string', label: 'Notes', widget: 'markdown', help: 'Markdown: **bold**, _italic_, - lists' }],
    ['code', 'Code', { type: 'string', label: 'Code', widget: 'code' }],
    ['json', 'JSON', { type: 'string', label: 'JSON', widget: 'json', format: 'json' }],
    ['hidden', 'Hidden value', { type: 'string', label: 'Hidden', widget: 'hidden' }],
  ]],
  ['Money & IDs', [
    ['card', 'Card number', { type: 'string', label: 'Card number', format: 'card' }],
    ['iban', 'IBAN', { type: 'string', label: 'IBAN', format: 'iban' }],
    ['account', 'Bank account', id('Account number', '\\d{9,18}', '123456789012')],
    ['ifsc', 'IFSC', id('IFSC', '[A-Z]{4}0[A-Z0-9]{6}', 'SBIN0001234')],
    ['pan', 'PAN', id('PAN', '[A-Z]{5}\\d{4}[A-Z]', 'ABCDE1234F')],
    ['aadhaar', 'Aadhaar', id('Aadhaar', '\\d{12}', '123412341234')],
    ['gstin', 'GSTIN', id('GSTIN', '\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]', '27ABCDE1234F1Z5')],
    ['pincode', 'PIN code', id('PIN code', '[1-9]\\d{5}', '411001')],
  ]],
  ['Groups & tables', [
    ['group', 'Group', NEW.group()],
    ['fullName', 'Full name', { type: 'group', label: 'Name', fields: { first: { type: 'string', label: 'First name' }, last: { type: 'string', label: 'Last name' } } }],
    ['address', 'Address', { type: 'group', label: 'Address', fields: {
      line1: { type: 'string', label: 'Address line 1' }, line2: { type: 'string', label: 'Address line 2' },
      city: { type: 'string', label: 'City' }, state: { type: 'string', label: 'State' },
      pincode: { type: 'string', label: 'PIN code', pattern: '[1-9]\\d{5}' }, country: { type: 'string', label: 'Country', format: 'country', default: 'IN' },
    } }],
    ['table', 'Table (add rows)', NEW.list()],
    ['fixedTable', 'Table with fixed rows', { type: 'list', label: 'Table', widget: 'table', rows: ['Row 1', 'Row 2'], rowHeading: 'Item', fields: { value: { type: 'string', label: 'Answer' } } }],
    ['cards', 'Repeating cards', { type: 'list', label: 'Entries', min: 1, fields: {} }],
  ]],
]

