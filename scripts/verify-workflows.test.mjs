import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { promisify } from 'node:util'
import { parse } from 'yaml'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(import.meta.dirname, '..')
const releaseTarball = 'nipe-solutions-react-drag-dismiss-1.0.0.tgz'

test('CI enforces the deterministic quality and browser matrix', async () => {
  validateCiWorkflow(await readWorkflow('.github/workflows/ci.yml'))
})

test('CI validator rejects weakened execution policy', async () => {
  const workflow = await readWorkflow('.github/workflows/ci.yml')
  const mutations = [
    (copy) => (copy.permissions = { contents: 'write' }),
    (copy) => (copy.concurrency['cancel-in-progress'] = true),
    (copy) => (copy.jobs.quality['runs-on'] = 'ubuntu-latest'),
    (copy) => delete copy.jobs.quality['timeout-minutes'],
    (copy) =>
      delete findAction(copy.jobs.quality, 'actions/setup-node').with[
        'cache-dependency-path'
      ],
    (copy) => (copy.jobs.browser.strategy.matrix.browser = ['chromium']),
    (copy) =>
      delete findAction(copy.jobs.browser, 'actions/upload-artifact').if,
    (copy) =>
      (findAction(copy.jobs.browser, 'actions/upload-artifact').with[
        'retention-days'
      ] = 30),
  ]

  for (const mutate of mutations) {
    const copy = structuredClone(workflow)
    mutate(copy)
    assert.throws(() => validateCiWorkflow(copy))
  }
})

test('release separates unprivileged verification from protected publish', async () => {
  validateReleaseWorkflow(await readWorkflow('.github/workflows/release.yml'))
})

test('publish shell rejects a checksum that names a substituted artifact', async () => {
  const workflow = await readWorkflow('.github/workflows/release.yml')
  const script = workflow.jobs.publish.steps.at(-1).run
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), 'react-drag-dismiss-publish-'),
  )
  const artifactDirectory = path.join(temporaryRoot, 'artifact')
  const binaryDirectory = path.join(temporaryRoot, 'bin')
  const marker = path.join(temporaryRoot, 'published')

  try {
    await mkdir(artifactDirectory)
    await mkdir(binaryDirectory)
    const npmShim = path.join(binaryDirectory, 'npm')
    await writeFile(
      npmShim,
      '#!/bin/sh\nprintf "%s\\n" "$*" > "$PUBLISH_MARKER"\n',
    )
    await chmod(npmShim, 0o755)

    const tarball = path.join(artifactDirectory, releaseTarball)
    await writeFile(tarball, 'verified tarball\n')
    await writeFile(
      `${tarball}.sha512`,
      `${sha512('verified tarball\n')}  ${releaseTarball}\n`,
    )
    await runPublishScript(script, artifactDirectory, binaryDirectory, marker)
    assert.match(
      await readFile(marker, 'utf8'),
      /publish --ignore-scripts --provenance --access public --tag latest/,
    )

    await rm(marker)
    const substitutedName = 'nipe-solutions-react-drag-dismiss-1X0X0Xtgz'
    await writeFile(
      path.join(artifactDirectory, substitutedName),
      'substituted artifact\n',
    )
    await writeFile(
      `${tarball}.sha512`,
      `${sha512('substituted artifact\n')}  ${substitutedName}\n`,
    )
    await assert.rejects(() =>
      runPublishScript(script, artifactDirectory, binaryDirectory, marker),
    )
    await assert.rejects(() => readFile(marker, 'utf8'), /ENOENT/)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})

test('release validator rejects weakened trust boundaries', async () => {
  const workflow = await readWorkflow('.github/workflows/release.yml')
  const mutations = [
    (copy) => (copy.on.release.types = ['created']),
    (copy) => delete copy.jobs.verify.if,
    (copy) => (copy.permissions = { 'id-token': 'write' }),
    (copy) => (copy.jobs.verify.permissions = { 'id-token': 'write' }),
    (copy) => (copy.concurrency.group = 'release-${{ github.ref }}'),
    (copy) => delete findAction(copy.jobs.verify, 'actions/checkout').with,
    (copy) =>
      (findRun(copy.jobs.verify, 'git merge-base').run = 'git status --short'),
    (copy) =>
      (findRun(copy.jobs.verify, 'npm run release:check').run =
        'npm pack --dry-run'),
    (copy) => (findRun(copy.jobs.verify, 'npm run check').if = 'false'),
    (copy) =>
      (findRun(copy.jobs.verify, 'npm run test:e2e')['continue-on-error'] =
        true),
    (copy) =>
      (findAction(copy.jobs.verify, 'actions/upload-artifact').with.name =
        'different-artifact'),
    (copy) => (copy.jobs.publish.environment = 'unprotected'),
    (copy) => (copy.jobs.publish.permissions = { contents: 'write' }),
    (copy) => copy.jobs.publish.steps.unshift({ uses: 'actions/checkout@v7' }),
    (copy) =>
      (findAction(copy.jobs.publish, 'actions/setup-node').with.cache = 'npm'),
    (copy) =>
      (findAction(copy.jobs.publish, 'actions/download-artifact').with.name =
        'different-artifact'),
    (copy) => {
      const finalStep = copy.jobs.publish.steps.at(-1)
      finalStep.run = finalStep.run.replaceAll('latest', 'alpha')
    },
    (copy) => {
      const finalStep = copy.jobs.publish.steps.at(-1)
      finalStep.run = finalStep.run.replace(
        releaseTarball,
        'nipe-solutions-react-drag-dismiss-1.0.1.tgz',
      )
    },
    (copy) => {
      const finalStep = copy.jobs.publish.steps.at(-1)
      finalStep.run = finalStep.run.replace(
        'sha512sum --check --strict',
        'sha512sum --check',
      )
    },
  ]

  for (const mutate of mutations) {
    const copy = structuredClone(workflow)
    mutate(copy)
    assert.throws(() => validateReleaseWorkflow(copy))
  }
})

async function readWorkflow(relativePath) {
  return parse(await readFile(path.join(repositoryRoot, relativePath), 'utf8'))
}

async function runPublishScript(
  script,
  artifactDirectory,
  binaryDirectory,
  marker,
) {
  return execFileAsync('bash', ['-c', script], {
    cwd: artifactDirectory,
    env: {
      ...process.env,
      PATH: `${binaryDirectory}:${process.env.PATH}`,
      PUBLISH_MARKER: marker,
      RELEASE_TARBALL: releaseTarball,
    },
  })
}

function sha512(contents) {
  return createHash('sha512').update(contents).digest('hex')
}

function stepsFor(job) {
  assert.ok(Array.isArray(job?.steps), 'job must define executable steps')
  return job.steps
}

function runCommands(job) {
  return stepsFor(job)
    .map((step) => step.run)
    .filter((command) => typeof command === 'string')
}

function findAction(job, action) {
  const step = stepsFor(job).find((candidate) =>
    candidate.uses?.startsWith(`${action}@`),
  )
  assert.ok(step, `${action} step is required`)
  return step
}

function findRun(job, fragment) {
  const step = stepsFor(job).find((candidate) =>
    candidate.run?.includes(fragment),
  )
  assert.ok(step, `${fragment} command is required`)
  return step
}

function assertActionMajor(job, action) {
  assert.equal(findAction(job, action).uses, `${action}@v7`)
}

function assertNodeSetup(job, { registry = false } = {}) {
  assertActionMajor(job, 'actions/setup-node')
  const setup = findAction(job, 'actions/setup-node')
  assert.equal(String(setup.with?.['node-version']), '24')
  if (registry) {
    assert.equal(setup.with?.['registry-url'], 'https://registry.npmjs.org')
    assert.equal(setup.with?.cache, undefined)
  } else {
    assert.equal(setup.with?.cache, 'npm')
    assert.equal(setup.with?.['cache-dependency-path'], 'package-lock.json')
  }
}

function validateCiWorkflow(workflow) {
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.equal(
    workflow.concurrency.group,
    'react-drag-dismiss-ci-${{ github.ref }}',
  )
  assert.equal(workflow.concurrency['cancel-in-progress'], false)
  assert.deepEqual(Object.keys(workflow.jobs).sort(), ['browser', 'quality'])

  const quality = workflow.jobs.quality
  assert.equal(quality['runs-on'], 'ubuntu-24.04')
  assert.ok(quality['timeout-minutes'] > 0)
  assert.ok(quality['timeout-minutes'] <= 30)
  assertActionMajor(quality, 'actions/checkout')
  assertNodeSetup(quality)
  assert.deepEqual(runCommands(quality), ['npm ci', 'npm run check'])

  const browser = workflow.jobs.browser
  assert.equal(browser['runs-on'], 'ubuntu-24.04')
  assert.ok(browser['timeout-minutes'] > 0)
  assert.ok(browser['timeout-minutes'] <= 30)
  assert.equal(browser.strategy?.['fail-fast'], false)
  assert.deepEqual(browser.strategy?.matrix?.browser, [
    'chromium',
    'firefox',
    'webkit',
  ])
  assertActionMajor(browser, 'actions/checkout')
  assertNodeSetup(browser)
  assert.deepEqual(runCommands(browser), [
    'npm ci',
    'npx playwright install --with-deps ${{ matrix.browser }}',
    'npm run test:e2e -- --project=${{ matrix.browser }}',
  ])

  assertActionMajor(browser, 'actions/upload-artifact')
  const artifact = findAction(browser, 'actions/upload-artifact')
  assert.equal(artifact.if, 'failure()')
  assert.equal(artifact.with?.name, 'playwright-${{ matrix.browser }}')
  assert.match(artifact.with?.path ?? '', /playwright-report/)
  assert.match(artifact.with?.path ?? '', /test-results/)
  assert.equal(artifact.with?.['if-no-files-found'], 'ignore')
  assert.ok(artifact.with?.['retention-days'] <= 7)
}

function validateReleaseWorkflow(workflow) {
  assert.deepEqual(workflow.on, { release: { types: ['published'] } })
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.equal(
    workflow.concurrency.group,
    'npm-nipe-solutions-react-drag-dismiss-stable',
  )
  assert.equal(workflow.concurrency['cancel-in-progress'], false)
  assert.deepEqual(Object.keys(workflow.jobs).sort(), ['publish', 'verify'])

  const verify = workflow.jobs.verify
  assert.equal(verify.if, 'github.event.release.prerelease == false')
  assert.equal(verify['runs-on'], 'ubuntu-24.04')
  assert.ok(verify['timeout-minutes'] > 0)
  assert.ok(verify['timeout-minutes'] <= 60)
  assert.deepEqual(verify.outputs, {
    tarball: '${{ steps.release.outputs.tarball }}',
  })
  assert.equal(verify.permissions, undefined)
  assertActionMajor(verify, 'actions/checkout')
  assert.equal(findAction(verify, 'actions/checkout').with?.['fetch-depth'], 0)
  assertNodeSetup(verify)
  assert.deepEqual(runCommands(verify), [
    'git merge-base --is-ancestor HEAD origin/main',
    'npm ci',
    'npm run check',
    'npx playwright install --with-deps chromium firefox webkit',
    'npm run test:e2e',
    'npm run release:check -- --dry-run --output release-artifact',
  ])
  for (const command of [
    'git merge-base --is-ancestor HEAD origin/main',
    'npm ci',
    'npm run check',
    'npx playwright install --with-deps chromium firefox webkit',
    'npm run test:e2e',
    'npm run release:check -- --dry-run --output release-artifact',
  ]) {
    const step = findRun(verify, command)
    assert.equal(step.if, undefined)
    assert.equal(step['continue-on-error'], undefined)
  }

  const releaseStep = findRun(verify, 'npm run release:check')
  assert.equal(releaseStep.id, 'release')
  assertActionMajor(verify, 'actions/upload-artifact')
  const upload = findAction(verify, 'actions/upload-artifact')
  assert.equal(upload.with?.name, 'npm-package-stable')
  assert.equal(upload.with?.path, 'release-artifact')
  assert.equal(upload.with?.['if-no-files-found'], 'error')
  assert.ok(upload.with?.['retention-days'] <= 7)
  assert.ok(
    stepsFor(verify).indexOf(upload) > stepsFor(verify).indexOf(releaseStep),
  )

  const publish = workflow.jobs.publish
  assert.equal(publish.needs, 'verify')
  assert.equal(publish.environment, 'npm')
  assert.equal(publish['runs-on'], 'ubuntu-24.04')
  assert.ok(publish['timeout-minutes'] > 0)
  assert.ok(publish['timeout-minutes'] <= 10)
  assert.deepEqual(publish.permissions, { 'id-token': 'write' })
  assert.equal(
    stepsFor(publish).some((step) =>
      step.uses?.startsWith('actions/checkout@'),
    ),
    false,
  )
  assertNodeSetup(publish, { registry: true })
  assertActionMajor(publish, 'actions/download-artifact')
  const download = findAction(publish, 'actions/download-artifact')
  assert.equal(download.with?.name, 'npm-package-stable')
  assert.equal(download.with?.path, 'release-artifact')

  const commands = runCommands(publish)
  assert.equal(commands.length, 1)
  assert.doesNotMatch(commands[0], /npm (ci|install|run)|vite|tsc/)
  const finalStep = publish.steps.at(-1)
  assert.equal(finalStep.name, 'Validate and publish verified artifact')
  assert.equal(finalStep['working-directory'], 'release-artifact')
  assert.equal(
    finalStep.env?.RELEASE_TARBALL,
    '${{ needs.verify.outputs.tarball }}',
  )
  assert.match(finalStep.run, /RELEASE_CHANNEL="latest"/)
  assert.match(finalStep.run, new RegExp(releaseTarball.replaceAll('.', '\\.')))
  assert.match(finalStep.run, /tarballs=\(\*\.tgz\)/)
  assert.match(finalStep.run, /\$\{#tarballs\[@\]\} != 1/)
  assert.match(finalStep.run, /manifests=\(\*\.sha512\)/)
  assert.match(finalStep.run, /\$\{#manifests\[@\]\} != 1/)
  assert.match(finalStep.run, /entries=\(\*\)/)
  assert.match(finalStep.run, /\$\{#entries\[@\]\} != 2/)
  assert.match(finalStep.run, /\[0-9a-f\]\{128\}/)
  assert.match(finalStep.run, /BASH_REMATCH\[2\]/)
  assert.match(finalStep.run, /sha512sum --check --strict/)
  assert.equal((finalStep.run.match(/npm publish/g) ?? []).length, 1)
  assert.match(
    finalStep.run,
    /npm publish --ignore-scripts --provenance --access public --tag latest "\$RELEASE_TARBALL"/,
  )
}
