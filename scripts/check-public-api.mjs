import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const api = await import(
  pathToFileURL(new URL('../dist/index.js', import.meta.url).pathname)
)
assert.deepEqual(Object.keys(api).sort(), ['DragDismiss'])
console.log('Public API verified: DragDismiss')
