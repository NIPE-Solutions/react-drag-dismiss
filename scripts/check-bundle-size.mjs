import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { readFile, stat } from 'node:fs/promises'

const js = await readFile(new URL('../dist/index.js', import.meta.url))
const css = await stat(new URL('../dist/core.css', import.meta.url))
const gzip = gzipSync(js).byteLength
assert.ok(gzip <= 8_000, `ESM gzip ${gzip} B exceeds 8,000 B`)
assert.ok(css.size <= 1_000, `Core CSS ${css.size} B exceeds 1,000 B`)
console.log(`Bundle budget: ${gzip} B gzip JS, ${css.size} B CSS`)
