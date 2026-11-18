// Formatted text typed by people: bold, italic, lists, links, colour, cleaned before it is kept.
import { createElement as h, useEffect, useRef, type ChangeEvent, type ClipboardEvent, type MouseEvent } from 'react'
import { cleanHtml } from '../clean-html.ts'
import { text } from '../../core/form.ts'
import { cx, type WidgetProps } from '../context.ts'
import { textValue } from '../shell.ts'

/** Bold, italic, lists, links: kept as clean HTML (see cleanHtml). */
export function RichText(p: WidgetProps) {
  const ed = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ed.current
    if (el && document.activeElement !== el) el.innerHTML = cleanHtml(textValue(p.value)) // typing isn't overwritten
  }, [p.value])
  const sync = () => {
    const el = ed.current!
    p.set(el.textContent?.trim() || el.querySelector('li') ? cleanHtml(el.innerHTML) : null)
  }
  // ponytail: execCommand is old but every browser still runs it; a full editor (Tiptap, Lexical) can be passed as your own widget
  const run = (cmd: string, arg?: string) => { ed.current?.focus(); document.execCommand(cmd, false, arg); sync() }
  const tool = (label: string, title: string, fn: () => void) =>
    h('button', { type: 'button', title, 'aria-label': title, disabled: p.readOnly, onMouseDown: (e: MouseEvent) => e.preventDefault(), onClick: fn }, label)
  return h('div', { className: 'fw-rich' },
    h('div', { className: 'fw-rich-tools', role: 'toolbar', 'aria-label': `${p.label}: formatting` },
      tool('B', 'Bold', () => run('bold')), tool('I', 'Italic', () => run('italic')), tool('U', 'Underline', () => run('underline')),
      tool('S', 'Strikethrough', () => run('strikeThrough')), tool('H', 'Heading', () => run('formatBlock', 'h3')),
      tool('•', 'Bulleted list', () => run('insertUnorderedList')), tool('1.', 'Numbered list', () => run('insertOrderedList')),
      tool('❝', 'Quote', () => run('formatBlock', 'blockquote')),
      h('label', { className: 'fw-rich-colour', title: 'Text colour' },
        h('span', { 'aria-hidden': true }, 'A'),
        h('input', { type: 'color', 'aria-label': 'Text colour', disabled: p.readOnly, onMouseDown: (e: MouseEvent) => e.stopPropagation(),
          onChange: (e: ChangeEvent<HTMLInputElement>) => { document.execCommand('styleWithCSS', false, 'true'); run('foreColor', e.target.value) } })),
      tool('🔗', 'Link', () => { const url = prompt('Link address (https://…)'); if (url && /^(https?:|mailto:)/i.test(url.trim())) run('createLink', url.trim()) }),
      tool('⌫', 'Clear formatting', () => { run('removeFormat'); run('formatBlock', 'p') })),
    h('div', {
      ref: ed, id: p.id, className: cx('fw-rich-text', p.className), contentEditable: !p.readOnly, suppressContentEditableWarning: true,
      role: 'textbox', 'aria-multiline': true, 'aria-label': p.label, 'aria-invalid': p.error ? true : undefined, 'aria-describedby': p.describedBy,
      onInput: sync, onBlur: p.touch,
      onPaste: (e: ClipboardEvent<HTMLDivElement>) => { // pasted pages bring styles and scripts: keep only clean formatting
        e.preventDefault()
        const html = e.clipboardData.getData('text/html')
        document.execCommand('insertHTML', false, html ? cleanHtml(html) : e.clipboardData.getData('text/plain').replace(/[&<>]/g, (ch) => `&#${ch.charCodeAt(0)};`).replace(/\n/g, '<br>'))
        sync()
      },
    }))
}
