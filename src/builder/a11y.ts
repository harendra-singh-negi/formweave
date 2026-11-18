// Accessible names for the builder's small buttons.

/**
 * A button's name for screen readers: its own words when it has some (what people see is what they can say, WCAG 2.5.3),
 * else the title that explains a bare symbol such as ↑ or ✕.
 */
export const nameFor = (label: string, title: string) => (/\p{L}/u.test(label) ? undefined : title)
