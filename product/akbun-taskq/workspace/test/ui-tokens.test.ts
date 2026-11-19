import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The UI theme is an interface: css/theme/contract.css names the tokens, a theme file implements them,
// and component CSS reads only those names (or local ones it sets itself, such as --ink and --bar).
const CSS = join(import.meta.dirname, '..', 'ui', 'css')
const THEMES = ['astryx.css', 'carbon.css', 'soft.css']

function declared(text: string): Set<string> {
  return new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
}

function read(name: string): string {
  return readFileSync(join(CSS, name), 'utf8')
}

const contract = declared(read('theme/contract.css'))
const components = readdirSync(CSS).filter((name) => name.endsWith('.css'))

describe('ui token contract', () => {
  test('component CSS reads only contract tokens or tokens it sets itself', () => {
    for (const name of components) {
      const text = read(name)
      const local = declared(text)
      const used = [...text.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1])
      const unknown = used.filter((token) => !contract.has(token) && !local.has(token))
      assert.deepEqual([...new Set(unknown)], [], `${name} reads tokens outside the contract`)
    }
  })

  for (const theme of THEMES) {
    test(`${theme} defines every contract token, and nothing else`, () => {
      const text = read(join('theme', theme))
      const light = declared(text.slice(0, text.indexOf('@media')))
      assert.deepEqual([...contract].filter((token) => !light.has(token)), [], 'missing in the light theme')
      assert.deepEqual([...declared(text)].filter((token) => !contract.has(token)), [], 'not in the contract')
    })
  }
})
