// Sample: Cake order (steps, formulas, conditions). Made-up data.
import type { Sample } from './types.ts'

export const cakeOrder: Sample = {
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
      items: {
        type: 'list',
        widget: 'table',
        label: 'Cakes',
        min: 1,
        max: 6,
        totals: ['qty', 'amount'],
        fields: {
          flavour: {
            type: 'choice',
            widget: 'select',
            label: 'Flavour',
            options: ['Chocolate truffle', 'Mango cream', 'Red velvet', 'Pineapple'],
            required: true,
          },
          size: { type: 'choice', widget: 'select', label: 'Size', options: ['0.5 kg', '1 kg', '2 kg'], required: true },
          qty: { type: 'number', widget: 'stepper', label: 'Qty', min: 1, max: 20, decimals: 0, default: 1 },
          rate: { type: 'number', format: 'currency', currency: 'INR', label: 'Rate', decimals: 2, min: 0, required: true },
          amount: { type: 'number', format: 'currency', currency: 'INR', label: 'Amount', value: 'qty * rate', decimals: 2 },
        },
      },
      message: { type: 'string', label: 'Words on the cake', maxLength: 40, help: 'Up to 40 letters.' },
      eggless: { type: 'boolean', widget: 'toggle', label: 'Eggless' },
      tax: { type: 'number', format: 'currency', currency: 'INR', label: 'GST 5%', value: 'round(sum(items.amount) * 5 / 100, 2)', decimals: 2 },
      grandTotal: { type: 'number', format: 'currency', currency: 'INR', label: 'To pay', value: 'sum(items.amount) + tax', decimals: 2 },
      handover: { type: 'choice', widget: 'radio', label: 'Pick up or delivery', options: ['Pick up at the shop', 'Deliver it'], required: true, columns: 2 },
      region: { type: 'choice', widget: 'select', label: 'Region', options: ['Hill side', 'Lake side'], visible: "handover == 'Deliver it'", required: true },
      town: {
        type: 'choice',
        widget: 'select',
        label: 'Town',
        visible: "handover == 'Deliver it'",
        required: true,
        options: [
          { value: 'Pinegrove', visible: "region == 'Hill side'" },
          { value: 'Cedar Point', visible: "region == 'Hill side'" },
          { value: 'Bluewater', visible: "region == 'Lake side'" },
          { value: 'Reedsville', visible: "region == 'Lake side'" },
        ],
      },
      address: { type: 'string', widget: 'textarea', label: 'Address', visible: "handover == 'Deliver it'", required: true },
      when: { type: 'date', format: 'datetime', label: 'Ready by', required: true },
      photo: { type: 'file', label: 'A picture of a design you like', accept: 'image/*' },
      agree: { type: 'boolean', label: 'I have checked the order', required: true },
    },
    layout: [
      {
        type: 'pages',
        display: 'steps',
        children: [
          {
            type: 'section',
            title: 'You',
            children: [{ type: 'grid', cols: { base: 1, md: 2 }, children: ['customer', 'mobile'] }, 'occasion', 'occasionOther'],
          },
          {
            type: 'section',
            title: 'Cakes',
            children: [
              'items',
              { type: 'grid', cols: { base: 1, md: 2 }, children: ['message', 'eggless'] },
              'photo',
              { type: 'grid', cols: { base: 1, md: 2 }, children: ['tax', 'grandTotal'] },
            ],
          },
          {
            type: 'section',
            title: 'Handover',
            children: ['handover', { type: 'grid', cols: { base: 1, md: 2 }, children: ['region', 'town'] }, 'address', 'when', 'agree'],
          },
        ],
      },
    ],
  },
}
