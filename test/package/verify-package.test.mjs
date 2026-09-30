import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import {
  sanitizeNpmEnvironment,
  validatePackedFiles,
  verifyTarballConsumers,
} from '../../scripts/verify-package.mjs'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const expectedFiles = JSON.parse(
  await readFile(
    path.join(repositoryRoot, 'scripts/package-files.json'),
    'utf8',
  ),
)

test('packed inventory accepts only the public consumer contract', () => {
  assert.doesNotThrow(() => validatePackedFiles(expectedFiles, expectedFiles))
  assert.throws(
    () =>
      validatePackedFiles([...expectedFiles, 'src/private.ts'], expectedFiles),
    /Unexpected packed files: src\/private\.ts/,
  )
  assert.throws(
    () => validatePackedFiles(expectedFiles.slice(1), expectedFiles),
    /Missing packed files: CHANGELOG\.md/,
  )
})

test('npm environment removes script policy without discarding connection settings', () => {
  const result = sanitizeNpmEnvironment(
    {
      npm_config_allow_scripts: '@example/lower',
      NPM_CONFIG_ALLOW_SCRIPTS: '@example/upper',
      npm_config_registry: 'https://registry.npmjs.org/',
      HTTPS_PROXY: 'http://proxy.invalid',
      npm_config_cafile: '/tmp/ca.pem',
      npm_config_token: 'secret',
    },
    '/tmp/isolated-npmrc',
  )

  assert.equal(result.npm_config_allow_scripts, undefined)
  assert.equal(result.NPM_CONFIG_ALLOW_SCRIPTS, undefined)
  assert.equal(result.NPM_CONFIG_USERCONFIG, '/tmp/isolated-npmrc')
  assert.equal(result.npm_config_registry, 'https://registry.npmjs.org/')
  assert.equal(result.HTTPS_PROXY, 'http://proxy.invalid')
  assert.equal(result.npm_config_cafile, '/tmp/ca.pem')
  assert.equal(result.npm_config_token, 'secret')
})

test('packed artifact passes isolated React 18 and React 19 consumers', async () => {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), 'react-drag-dismiss-policy-'),
  )
  try {
    const packDirectory = path.join(temporaryRoot, 'pack')
    await mkdir(packDirectory)
    const { stdout } = await execFileAsync(
      'npm',
      ['pack', '--json', '--pack-destination', packDirectory],
      { cwd: repositoryRoot, maxBuffer: 10 * 1024 * 1024 },
    )
    const [pack] = JSON.parse(stdout)
    assert.ok(pack, 'npm pack did not report an artifact')
    validatePackedFiles(
      pack.files.map(({ path: file }) => file),
      expectedFiles,
    )
    assert.ok(pack.size < 40_000, `Tarball is too large: ${pack.size} bytes`)

    await verifyTarballConsumers(path.join(packDirectory, pack.filename))
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
