import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const html = await readFile(
  new URL('../dist-website/index.html', import.meta.url),
  'utf8',
)
assert.match(html, /React Drag Dismiss/)
assert.doesNotMatch(html, /http:\/\/localhost/)
console.log('Static website verified')
