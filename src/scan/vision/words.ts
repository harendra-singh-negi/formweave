// The printed words: grouped into phrases, cleaned into labels, and what they say about the kind of answer.
import { rect } from './pixels.ts'
import type { ColumnKind, Kind, Phrase, Rect, Word } from './types.ts'

export const KIND_WORDS: [RegExp, Kind][] = [
  [/e-?mail|ईमेल/i, 'email'],
  [/mobile|phone|\btel(?:ephone)?\b|contact no|whatsapp|फ़ोन|फोन|मोबाइल/i, 'phone'],
  [/signature|\bsign(?:ed)?\b|हस्ताक्षर/i, 'signature'],
  [/\bdate\b|\bd\.?o\.?b\b|birth|dated|तिथि|तारीख|दिनांक/i, 'date'],
  [/\btime\b|समय/i, 'time'],
  [/\bage\b|\bqty\b|quantity|how many|number of|no\. of|\byears?\b|आयु|उम्र|संख्या/i, 'number'],
  [/amount|salary|price|\bfees?\b|\bcost\b|income|total|₹|\brs\.?(?=\s|$)|\binr\b|वेतन|राशि|रुपये/i, 'money'],
  [/photo(?:graph)?|attach|upload|फोटो/i, 'file'],
  [/address|remarks?|comments?|description|reason|purpose|पता|टिप्पणी|विवरण/i, 'long_text'],
]
export const kindOf = (label: string, otherwise: Kind): Kind => KIND_WORDS.find(([re]) => re.test(label))?.[1] ?? otherwise
export const columnKind = (label: string): ColumnKind => {
  const k = kindOf(label, 'text')
  return k === 'number' || k === 'money' || k === 'date' || k === 'long_text' ? k : 'text'
}
export const SCALE_WORDS = /\b(?:below|above|average|poor|fair|good|very good|excellent|satisfactory|unsatisfactory|low|medium|high|never|rarely|sometimes|often|always|agree|disagree|neutral)\b/i
export const NUMBERING = /^(?:s\.?\s*no\.?|sr\.?\s*no\.?|no\.?|#|sl\.?\s*no\.?|क्र\.?\s*सं\.?)$/i
export const CHOICE_WORDS = /^(yes|no|n\/?a|ok|not ok|done|pass|fail|true|false|हाँ|हां|नहीं|✓|✔|x)$/i

/** A long printed heading cut to its first part: "OPEN ITEMS, MEMORANDA (Where Class records…)" → "OPEN ITEMS, MEMORANDA". */
export function shortLabel(s: string): string {
  if (s.length <= 60) return s
  const cut = s.split(/\s[(–-]\s?|\.\s/)[0]
  return (cut.length <= 80 ? cut : cut.slice(0, 80).replace(/\s\S*$/, '')).trim()
}

/** "1. Full name*:" → "Full name" */
export function cleanLabel(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[1l|] (?=[a-z])/, 'I ') // OCR reads a capital I as 1 or l
    .replace(/^\(?(?:\d{1,2}|[a-hA-H]|[ivxIVX]{1,4})[.)]\s+/, '')
    .replace(/\*/g, '')
    .replace(/(\p{L}{2,})[:：]\s+(?=\S)/u, '$1 – ') // "LAST PSC INSPECTION: Place" → "LAST PSC INSPECTION – Place"
    .replace(/[^\p{L}\p{M}\p{N})\]?]+$/u, '') // trailing colons, dots, quotes and OCR's stray marks (®, ’)
    .replace(/^(.*\([^)]*)$/, '$1)') // "Amount (Rs.):" loses its ")" with the colon
    .trim()
}

export function headingLike(p: Phrase, em: number): boolean {
  if (/^[•·▪◦‣∙●○■➢►✓-]/.test(p.text) || /\.$/.test(p.text)) return false // a point of a list, or a sentence
  const letters = p.text.replace(/[^\p{L}]/gu, '')
  const upper = letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()
  const numbered = /^(?:\d{1,2}|[IVX]{1,4}|[A-H])[.)]\s+\S/.test(p.text)
  return p.text.length <= 80 && letters.length >= 2 && !/[:：]$/.test(p.text) && (p.y1 - p.y0 >= 1.3 * em || numbered || upper)
}

export const overlapY = (a: Rect, b: Rect) => Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
export const overlapX = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
export const centerIn = (a: Rect, b: Rect) => (a.x0 + a.x1) / 2 >= b.x0 && (a.x0 + a.x1) / 2 <= b.x1 && (a.y0 + a.y1) / 2 >= b.y0 && (a.y0 + a.y1) / 2 <= b.y1
export const box = (rs: Rect[]): Rect => ({
  x0: Math.min(...rs.map((r) => r.x0)),
  y0: Math.min(...rs.map((r) => r.y0)),
  x1: Math.max(...rs.map((r) => r.x1)),
  y1: Math.max(...rs.map((r) => r.y1)),
})

/** Words into text lines, and lines into phrases where a wide gap separates them. */
export function phrasesOf(words: Word[], em: number, walls: Rect[] = []): Phrase[][] {
  const split = (a: Word, b: Word) => walls.some((v) => v.x0 >= a.x1 - 2 && v.x0 <= b.x0 + 2 && v.y0 <= Math.min(a.y0, b.y0) && v.y1 >= Math.max(a.y1, b.y1))
  const lines: (Rect & { words: Word[] })[] = []
  for (const w of [...words].sort((a, b) => a.y0 + a.y1 - b.y0 - b.y1)) {
    const line = lines.find((l) => overlapY(l, w) >= 0.5 * Math.min(l.y1 - l.y0, w.y1 - w.y0))
    if (line) {
      line.words.push(w)
      Object.assign(line, box([line, w]))
    } else lines.push({ ...rect(w), words: [w] })
  }
  return lines
    .sort((a, b) => a.y0 - b.y0)
    .map((l) => {
      const ws = l.words.sort((a, b) => a.x0 - b.x0)
      const out: Phrase[] = []
      let cur: Word[] = []
      const flush = () => {
        if (cur.length) out.push({ ...box(cur), text: cur.map((w) => w.text).join(' '), words: cur, used: false })
        cur = []
      }
      for (const w of ws) {
        if (cur.length && (w.x0 - cur[cur.length - 1].x1 > 1.2 * em || split(cur[cur.length - 1], w))) flush()
        cur.push(w)
      }
      flush()
      return out
    })
}

/**
 * What one page asks for, in reading order: headings, and fields with their labels and kinds.
 * `words` are OCR's words on the page with the shapes erased.
 */
