import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error: a browser module without types, pure so node runs it
import { inline, parse } from '../ui/js/pure/markdown.js'

// The .md preview reads Markdown into plain objects; the view only ever sets textContent, so no markup gets through.

describe('markdown preview', () => {
  test('[critical] blocks bots write: headings, lists, code, quotes, tables, rules', () => {
    const blocks = parse('# Title\n\nSome **bold** and `code`.\n\n- one\n- two\n\n1. first\n\n```ts\nconst x = 1\n```\n\n> quoted\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---')
    assert.deepEqual(blocks.map((b: { t: string }) => b.t), ['h', 'p', 'ul', 'ol', 'code', 'quote', 'table', 'hr'])
    assert.equal(blocks[4].text, 'const x = 1')
    assert.deepEqual(blocks[6].rows[0].map((c: { text: string }[]) => c[0].text), ['1', '2'])
  })

  test('[critical] links keep only http, https and mailto; raw HTML stays text', () => {
    assert.deepEqual(inline('[ok](https://a.example)'), [{ t: 'link', text: 'ok', href: 'https://a.example' }])
    assert.ok(!inline('[bad](javascript:alert(1))').some((part: { t: string }) => part.t === 'link'), 'a javascript: link is text')
    const html = parse('<script>alert(1)</script>')
    assert.deepEqual(html, [{ t: 'p', inline: [{ t: 'text', text: '<script>alert(1)</script>' }] }])
  })
})
