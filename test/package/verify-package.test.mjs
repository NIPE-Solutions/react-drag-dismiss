import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

test('npm tarball contains only the consumer contract', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'react-drag-dismiss-package-'))
  try {
    const output = execFileSync(
      'npm',
      ['pack', '--json', '--pack-destination', directory],
      { encoding: 'utf8' },
    )
    const [{ filename, files }] = JSON.parse(output)
    const paths = files.map((file) => file.path).sort()
    assert.deepEqual(paths, [
      'LICENSE',
      'README.md',
      'dist/core.css',
      'dist/index.cjs',
      'dist/index.cjs.map',
      'dist/index.d.ts',
      'dist/index.js',
      'dist/index.js.map',
      'package.json',
    ])
    const packed = await readFile(join(directory, filename))
    assert.ok(packed.byteLength < 40_000)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('ESM, CJS, and SSR consumer entrypoints work', async () => {
  const esm = await import('../../dist/index.js')
  const require = createRequire(import.meta.url)
  const cjs = require('../../dist/index.cjs')
  assert.equal(typeof esm.DragDismiss, 'object')
  assert.equal(typeof cjs.DragDismiss, 'object')
  const html = renderToString(
    createElement(esm.DragDismiss, null, 'SSR content'),
  )
  assert.match(html, /SSR content/)
  assert.match(html, /data-state="idle"/)
})
