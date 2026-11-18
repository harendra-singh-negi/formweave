// formweave/samples: ready-made forms that show every input and every layout piece at work. All names and data are made up.
// Load one into the builder (Scan / Import → Samples) or render it: <Form schema={SAMPLES[0].schema} />.
// A new sample: add a file in ./samples and list it here.
import { everyInputSample } from './samples/every-input.ts'
import { cakeOrder } from './samples/cake-order.ts'
import { gymMembership } from './samples/gym-membership.ts'
import { gardenSurvey } from './samples/garden-survey.ts'
import { libraryCard } from './samples/library-card.ts'
import { eventRegistration } from './samples/event-registration.ts'
import type { Sample } from './samples/types.ts'

export type { Sample }
export const SAMPLES: Sample[] = [everyInputSample, cakeOrder, gymMembership, gardenSurvey, libraryCard, eventRegistration]
