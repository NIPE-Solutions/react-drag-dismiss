import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('CI runs the quality gate and browser matrix', async () => {
  const ci = await readFile(
    new URL('../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  )
  assert.match(ci, /npm run check/)
  assert.match(ci, /chromium, firefox, webkit/)
})

test('release uses npm provenance through OIDC', async () => {
  const release = await readFile(
    new URL('../.github/workflows/release.yml', import.meta.url),
    'utf8',
  )
  assert.match(release, /id-token: write/)
  assert.match(release, /npm publish --provenance/)
})
