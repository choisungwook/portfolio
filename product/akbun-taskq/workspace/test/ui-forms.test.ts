import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Views read form fields as form.elements.<name>. Two fields with one name make that a RadioNodeList, which has no
// addEventListener or value of its own: the bot dialog once failed to set up and its Save only closed it.
const HTML = readFileSync(join(import.meta.dirname, '..', 'ui', 'index.html'), 'utf8')

// A webview that is not a browser answers confirm() and prompt() with false and null and shows nothing.
test('the UI asks through core/ask.js, never the native confirm or prompt', () => {
  const root = join(import.meta.dirname, '..', 'ui', 'js')
  for (const name of readdirSync(root, { recursive: true }) as string[]) {
    if (!name.endsWith('.js')) continue
    assert.doesNotMatch(readFileSync(join(root, name), 'utf8'), /(?<![\w.])(confirm|prompt|alert)\(/, name)
  }
})

describe('ui forms', () => {
  test('[critical] a form has one field per name, except checkbox and radio groups', () => {
    const duplicates: string[] = []
    for (const [, attrs, body] of HTML.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)) {
      const seen = new Set<string>()
      for (const [field] of body.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
        const name = /\bname="([^"]+)"/.exec(field)?.[1]
        if (!name || /type="(checkbox|radio)"/.test(field)) continue
        if (seen.has(name)) duplicates.push(`${/data-area="([^"]+)"/.exec(attrs)?.[1] ?? 'form'}: ${name}`)
        seen.add(name)
      }
    }
    assert.deepEqual(duplicates, [])
  })
})
