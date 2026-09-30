import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

const output = new URL('../dist-website/', import.meta.url)

const html = await readFile(new URL('index.html', output), 'utf8')
const assetNames = await readdir(new URL('assets/', output))
const scripts = await Promise.all(
  assetNames
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFile(new URL(`assets/${name}`, output), 'utf8')),
)
const javascript = scripts.join('\n')

assert.match(html, /React Drag Dismiss/)
assert.doesNotMatch(html, /http:\/\/localhost/)
assert.match(javascript, /1\.0 stable/)
assert.doesNotMatch(javascript, /0\.1\.0-alpha\.1/)
console.log('Static website verified')
