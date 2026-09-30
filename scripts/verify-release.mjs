import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import console from 'node:console'
import { createHash } from 'node:crypto'
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import {
  sanitizeNpmEnvironment,
  validatePackedFiles,
  verifyTarballConsumers,
} from './verify-package.mjs'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(import.meta.dirname, '..')
const expectedName = '@nipe-solutions/react-drag-dismiss'
const expectedRepository =
  'git+https://github.com/NIPE-Solutions/react-drag-dismiss.git'
const stableSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function validateReleaseMetadata(packageJson, changelog) {
  assert.equal(packageJson.name, expectedName, 'Unexpected package name')
  assert.deepEqual(
    packageJson.repository,
    { type: 'git', url: expectedRepository },
    'Unexpected package repository',
  )
  assert.match(
    packageJson.version,
    stableSemver,
    `Package version ${packageJson.version} must be a stable semantic version`,
  )
  assert.match(
    changelog,
    new RegExp(
      `^## ${escapeRegExp(packageJson.version)} — \\d{4}-\\d{2}-\\d{2}$`,
      'm',
    ),
    `CHANGELOG.md must contain a dated release entry for ${packageJson.version}`,
  )
  assert.equal(
    packageJson.publishConfig?.access,
    'public',
    'publishConfig must enforce public access',
  )
  assert.equal(
    packageJson.publishConfig?.provenance,
    true,
    'publishConfig must enable provenance',
  )
  assert.equal(
    packageJson.publishConfig?.tag,
    'latest',
    'Stable releases must use the latest dist-tag',
  )
  assert.deepEqual(
    packageJson.dependencies ?? {},
    {},
    'Stable releases must have zero runtime dependencies',
  )

  return {
    name: packageJson.name,
    version: packageJson.version,
    channel: 'latest',
  }
}

export function validateRepositoryContext({
  branch,
  dirtyEntries,
  dryRun,
  githubActions,
  eventName,
  refName,
  refType,
  version,
}) {
  const messages = []

  if (githubActions) {
    assert.equal(
      dirtyEntries.length,
      0,
      'GitHub release tracked state must be clean',
    )
    assert.equal(
      eventName,
      'release',
      'GitHub verification requires a release event',
    )
    assert.equal(refType, 'tag', 'GitHub release verification requires a tag')
    assert.equal(
      refName,
      `v${version}`,
      `Release tag ${refName} must exactly match v${version}`,
    )
    return messages
  }

  assert.equal(dryRun, true, 'Local release verification is dry-run only')
  if (dirtyEntries.length > 0) {
    messages.push(
      `Local dry-run: allowing ${dirtyEntries.length} working-tree changes for inspection`,
    )
  }
  if (branch && branch !== 'main') {
    messages.push(`Local dry-run: running from feature branch ${branch}`)
  }
  return messages
}

export function assertRegistryVersionAbsent(publishedVersion, version) {
  assert.notEqual(
    publishedVersion,
    version,
    `${expectedName}@${version} already exists on the npm registry`,
  )
}

export function parseArguments(args) {
  const usage = 'Usage: verify-release.mjs --dry-run [--output directory]'
  assert.equal(args[0], '--dry-run', usage)
  if (args.length === 1) {
    return { dryRun: true, outputDirectory: undefined }
  }
  assert.equal(args.length, 3, usage)
  assert.equal(args[1], '--output', usage)
  assert.ok(args[2], 'Release output directory must not be empty')
  return { dryRun: true, outputDirectory: args[2] }
}

export async function writeArtifactChecksum(tarballPath) {
  const digest = createHash('sha512')
    .update(await readFile(tarballPath))
    .digest('hex')
  const checksumPath = `${tarballPath}.sha512`
  await writeFile(checksumPath, `${digest}  ${path.basename(tarballPath)}\n`, {
    flag: 'wx',
  })
  return { checksumPath, digest }
}

export async function verifyRelease({ dryRun = false, outputDirectory } = {}) {
  assert.equal(dryRun, true, 'Release verification requires --dry-run')

  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
  )
  const changelog = await readFile(
    path.join(repositoryRoot, 'CHANGELOG.md'),
    'utf8',
  )
  const expectedFiles = JSON.parse(
    await readFile(
      path.join(import.meta.dirname, 'package-files.json'),
      'utf8',
    ),
  )
  const release = validateReleaseMetadata(packageJson, changelog)

  assert.match(
    packageJson.scripts?.check ?? '',
    /npm run test:release-policy/,
    'The quality gate must include release policy tests',
  )
  assert.doesNotMatch(
    packageJson.scripts?.check ?? '',
    /release:check/,
    'The normal quality gate must not invoke release verification',
  )

  const [{ stdout: status }, { stdout: branch }] = await Promise.all([
    run('git', ['status', '--porcelain', '--untracked-files=no']),
    run('git', ['branch', '--show-current']),
  ])
  const dirtyEntries = status.trim() ? status.trimEnd().split('\n') : []

  for (const message of validateRepositoryContext({
    branch: branch.trim(),
    dirtyEntries,
    dryRun,
    githubActions: process.env.GITHUB_ACTIONS === 'true',
    eventName: process.env.GITHUB_EVENT_NAME,
    refName: process.env.GITHUB_REF_NAME,
    refType: process.env.GITHUB_REF_TYPE,
    version: release.version,
  })) {
    console.log(message)
  }

  console.log(`Release candidate: ${release.name}@${release.version}`)
  console.log(`Release channel: ${release.channel}`)
  await runVisible('npm', ['run', 'build:dist'])
  await runVisible('npm', ['run', 'test:api'])
  await runVisible('npm', ['run', 'test:size'])

  const packDirectory = outputDirectory
    ? path.resolve(repositoryRoot, outputDirectory)
    : await mkdtemp(path.join(tmpdir(), 'react-drag-dismiss-release-'))
  if (outputDirectory) await mkdir(packDirectory)

  try {
    const { stdout } = await run('npm', [
      'pack',
      '--json',
      '--pack-destination',
      packDirectory,
    ])
    const [pack] = JSON.parse(stdout)
    assert.ok(pack, 'npm pack did not report an artifact')

    const expectedFilename =
      `${release.name.replace(/^@/, '').replaceAll('/', '-')}-` +
      `${release.version}.tgz`
    assert.equal(
      pack.filename,
      expectedFilename,
      'npm pack returned an unexpected artifact filename',
    )
    validatePackedFiles(
      pack.files.map(({ path: file }) => file),
      expectedFiles,
    )
    assert.ok(
      pack.size < 40_000,
      `Compressed package must be below 40,000 bytes: ${pack.size}`,
    )
    console.log(
      `Artifact inventory verified (${pack.entryCount} files, ${pack.size} bytes)`,
    )

    const tarballPath = path.join(packDirectory, pack.filename)
    await verifyTarballConsumers(tarballPath)

    const publishedVersion = await readRegistryVersion(
      release.name,
      release.version,
    )
    assertRegistryVersionAbsent(publishedVersion, release.version)
    console.log(`Registry version is unpublished: ${release.version}`)

    await runVisible('npm', [
      'publish',
      '--dry-run',
      '--ignore-scripts',
      '--provenance',
      '--access',
      'public',
      '--tag',
      release.channel,
      tarballPath,
    ])

    const checksum = await writeArtifactChecksum(tarballPath)
    if (outputDirectory) {
      await writeGitHubOutputs({ tarball: pack.filename })
      console.log(`Verified artifact preserved at ${tarballPath}`)
      console.log(`SHA-512: ${checksum.digest}`)
    }
  } finally {
    if (!outputDirectory) {
      await rm(packDirectory, { recursive: true, force: true })
    }
  }

  console.log('Release dry-run verification passed; nothing was published')
}

async function writeGitHubOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) return
  const lines = Object.entries(outputs)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')
  await appendFile(process.env.GITHUB_OUTPUT, `${lines}\n`)
}

async function readRegistryVersion(name, version) {
  try {
    const { stdout } = await run('npm', [
      'view',
      `${name}@${version}`,
      'version',
      '--json',
    ])
    const parsed = JSON.parse(stdout)
    return typeof parsed === 'string' ? parsed : undefined
  } catch (error) {
    const output = `${String(error.stdout ?? '')}\n${String(error.stderr ?? '')}`
    if (/E404|404 Not Found/.test(output)) return undefined
    throw error
  }
}

async function runVisible(command, args) {
  const { stdout, stderr } = await run(command, args)
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)
}

function run(command, args) {
  return execFileAsync(command, args, {
    cwd: repositoryRoot,
    env: sanitizeNpmEnvironment(
      process.env,
      process.env.NPM_CONFIG_USERCONFIG ?? '',
    ),
    maxBuffer: 10 * 1024 * 1024,
  })
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  try {
    await verifyRelease(parseArguments(process.argv.slice(2)))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
