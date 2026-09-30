import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  assertRegistryVersionAbsent,
  parseArguments,
  validateReleaseMetadata,
  validateRepositoryContext,
  writeArtifactChecksum,
} from './verify-release.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const stablePackage = {
  name: '@nipe-solutions/react-drag-dismiss',
  version: '1.0.0',
  repository: {
    type: 'git',
    url: 'git+https://github.com/NIPE-Solutions/react-drag-dismiss.git',
  },
  dependencies: {},
  publishConfig: { access: 'public', provenance: true, tag: 'latest' },
}
const stableChangelog = '## 1.0.0 — 2026-09-30\n'
const releaseTarball = 'nipe-solutions-react-drag-dismiss-1.0.0.tgz'

test('stable release metadata returns the latest channel', () => {
  assert.deepEqual(validateReleaseMetadata(stablePackage, stableChangelog), {
    name: stablePackage.name,
    version: '1.0.0',
    channel: 'latest',
  })
})

test('repository metadata satisfies stable release policy', async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
  )
  const changelog = await readFile(
    path.join(repositoryRoot, 'CHANGELOG.md'),
    'utf8',
  )

  assert.deepEqual(validateReleaseMetadata(packageJson, changelog), {
    name: stablePackage.name,
    version: '1.0.0',
    channel: 'latest',
  })
})

test('stable metadata rejects prereleases and malformed versions', () => {
  for (const version of ['1.0.0-alpha.1', '1.0.0+build.1', '01.0.0', '1.0']) {
    assert.throws(
      () =>
        validateReleaseMetadata(
          { ...stablePackage, version },
          `## ${version} — 2026-09-30\n`,
        ),
      /stable semantic version/,
    )
  }
})

test('stable metadata rejects incomplete publication policy', () => {
  const cases = [
    [{ ...stablePackage, name: '@example/wrong' }, stableChangelog],
    [
      {
        ...stablePackage,
        repository: { type: 'git', url: 'https://example.com/wrong' },
      },
      stableChangelog,
    ],
    [
      {
        ...stablePackage,
        publishConfig: { ...stablePackage.publishConfig, access: 'restricted' },
      },
      stableChangelog,
    ],
    [
      {
        ...stablePackage,
        publishConfig: { ...stablePackage.publishConfig, provenance: false },
      },
      stableChangelog,
    ],
    [
      {
        ...stablePackage,
        publishConfig: { ...stablePackage.publishConfig, tag: 'alpha' },
      },
      stableChangelog,
    ],
    [{ ...stablePackage, dependencies: { leftpad: '1.0.0' } }, stableChangelog],
    [stablePackage, '## Unreleased\n'],
  ]

  for (const [manifest, changelog] of cases) {
    assert.throws(() => validateReleaseMetadata(manifest, changelog))
  }
})

test('repository context requires the exact release tag and clean state', () => {
  const context = {
    branch: '',
    dirtyEntries: [],
    dryRun: true,
    githubActions: true,
    eventName: 'release',
    refName: 'v1.0.0',
    refType: 'tag',
    version: '1.0.0',
  }

  assert.deepEqual(validateRepositoryContext(context), [])
  assert.throws(
    () => validateRepositoryContext({ ...context, refName: '1.0.0' }),
    /must exactly match/,
  )
  assert.throws(
    () =>
      validateRepositoryContext({
        ...context,
        dirtyEntries: [' M package.json'],
      }),
    /must be clean/,
  )
})

test('local release inspection is dry-run only', () => {
  const messages = validateRepositoryContext({
    branch: 'release/stable-1.0.0',
    dirtyEntries: [' M package.json'],
    dryRun: true,
    githubActions: false,
    version: '1.0.0',
  })

  assert.equal(messages.length, 2)
  assert.throws(
    () =>
      validateRepositoryContext({
        branch: 'main',
        dirtyEntries: [],
        dryRun: false,
        githubActions: false,
        version: '1.0.0',
      }),
    /dry-run only/,
  )
})

test('registry guard rejects an existing version', () => {
  assert.doesNotThrow(() => assertRegistryVersionAbsent(undefined, '1.0.0'))
  assert.throws(
    () => assertRegistryVersionAbsent('1.0.0', '1.0.0'),
    /already exists/,
  )
})

test('release arguments accept only the documented dry-run forms', () => {
  assert.deepEqual(parseArguments(['--dry-run']), {
    dryRun: true,
    outputDirectory: undefined,
  })
  assert.deepEqual(parseArguments(['--dry-run', '--output', 'artifact']), {
    dryRun: true,
    outputDirectory: 'artifact',
  })

  for (const args of [
    [],
    ['--publish'],
    ['--dry-run', '--output'],
    ['--dry-run', '--output', ''],
    ['--dry-run', '--output', 'artifact', '--extra'],
  ]) {
    assert.throws(() => parseArguments(args), /Usage:|must not be empty/)
  }
})

test('checksum output is deterministic and cannot be overwritten', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'react-drag-dismiss-checksum-'),
  )
  const tarball = path.join(directory, releaseTarball)

  try {
    await writeFile(tarball, 'verified artifact\n')
    const { checksumPath, digest } = await writeArtifactChecksum(tarball)
    assert.match(digest, /^[a-f0-9]{128}$/)
    assert.equal(
      await readFile(checksumPath, 'utf8'),
      `${digest}  ${releaseTarball}\n`,
    )
    await assert.rejects(() => writeArtifactChecksum(tarball), /EEXIST/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
