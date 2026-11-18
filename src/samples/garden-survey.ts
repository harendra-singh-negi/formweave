// Sample: Garden club survey (matrix, columns, accordion). Made-up data.
import type { Sample } from './types.ts'

export const gardenSurvey: Sample = {
  id: 'garden-survey',
  title: 'Garden club survey (matrix, columns, accordion)',
  about: 'An accordion: a rating matrix with a comment column, tick boxes in three columns, a percent, stars and a long answer.',
  schema: {
    version: 1,
    title: 'Garden club survey',
    fields: {
      visits: {
        type: 'choice',
        widget: 'radio',
        label: 'How often do you come?',
        options: ['Every week', 'Every month', 'Now and then', 'First time'],
        columns: 2,
        required: true,
      },
      grow: {
        type: 'choice',
        multiple: true,
        label: 'What do you grow?',
        columns: 3,
        options: ['Tomatoes', 'Chillies', 'Marigolds', 'Spinach', 'Mint', 'Roses', 'Beans', 'Basil', 'Sunflowers'],
      },
      rate: {
        type: 'list',
        widget: 'matrix',
        label: 'Rate the garden',
        rowHeading: 'Part',
        rows: ['Paths', 'Water taps', 'Tool shed', 'Compost bins'],
        fields: {
          score: { type: 'choice', label: 'Rating', options: ['Poor', 'Fair', 'Good', 'Great'], required: true },
          note: { type: 'string', label: 'Comment' },
        },
      },
      shade: { type: 'number', format: 'percent', label: 'How much of your plot is in shade?', min: 0, max: 100 },
      overall: { type: 'number', widget: 'rating', label: 'Overall', min: 1, max: 5, decimals: 0 },
      ideas: { type: 'string', widget: 'richtext', label: 'Ideas for next season' },
    },
    layout: [
      {
        type: 'pages',
        display: 'accordion',
        children: [
          { type: 'section', title: 'You and your plot', children: ['visits', 'grow', 'shade'] },
          { type: 'section', title: 'The garden', children: ['rate', 'overall'] },
          { type: 'section', title: 'Next season', children: ['ideas'] },
        ],
      },
    ],
  },
}
