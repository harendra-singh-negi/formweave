// Sample: Gym membership (tabs, dates, signature). Made-up data.
import type { Sample } from './types.ts'

export const gymMembership: Sample = {
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
}
