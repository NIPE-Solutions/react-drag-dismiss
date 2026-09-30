import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import console from 'node:console'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(import.meta.dirname, '..')
const packageName = '@nipe-solutions/react-drag-dismiss'
const consumerLanes = [
  {
    label: 'React 18',
    react: '18.3.1',
    reactDom: '18.3.1',
    reactTypes: '18',
    reactDomTypes: '18',
  },
  {
    label: 'React 19',
    react: '19.1.1',
    reactDom: '19.1.1',
    reactTypes: '19',
    reactDomTypes: '19',
  },
]

export function validatePackedFiles(actualFiles, expectedFiles) {
  const actual = [...actualFiles].sort()
  const expected = [...expectedFiles].sort()
  const unexpected = actual.filter((file) => !expected.includes(file))
  const missing = expected.filter((file) => !actual.includes(file))
  const messages = []

  if (unexpected.length > 0) {
    messages.push(`Unexpected packed files: ${unexpected.join(', ')}`)
  }
  if (missing.length > 0) {
    messages.push(`Missing packed files: ${missing.join(', ')}`)
  }

  assert.deepEqual(
    actual,
    expected,
    messages.join('\n') || 'Packed file inventory differs from its allowlist',
  )
}

export function sanitizeNpmEnvironment(environment, userConfig) {
  const sanitized = Object.fromEntries(
    Object.entries(environment).filter(([name]) => {
      const normalized = name.toLowerCase()
      return (
        normalized !== 'npm_config_allow_scripts' &&
        normalized !== 'npm_config_userconfig'
      )
    }),
  )

  return {
    ...sanitized,
    NPM_CONFIG_USERCONFIG: userConfig,
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
  }
}

export async function verifyTarballConsumers(tarballPath) {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), 'react-drag-dismiss-consumers-'),
  )
  const userConfig = path.join(temporaryRoot, 'npmrc')
  await writeFile(userConfig, '')

  try {
    for (const lane of consumerLanes) {
      const consumer = path.join(temporaryRoot, lane.label.replace(' ', '-'))
      await mkdir(consumer)
      await writeFile(
        path.join(consumer, 'package.json'),
        `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`,
      )

      await run(
        'npm',
        [
          'install',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--no-package-lock',
          '--save-exact',
          '--install-strategy=hoisted',
          path.resolve(tarballPath),
          `react@${lane.react}`,
          `react-dom@${lane.reactDom}`,
          `@types/react@${lane.reactTypes}`,
          `@types/react-dom@${lane.reactDomTypes}`,
        ],
        consumer,
        userConfig,
      )

      await verifyModulesAndSsr(consumer)
      await verifyTypes(consumer)
      await verifyStylesAndManifest(consumer)
      console.log(`${lane.label}: ESM, CJS, types, CSS, and SSR passed`)
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

export async function verifyPackage() {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), 'react-drag-dismiss-package-'),
  )
  try {
    const packDirectory = path.join(temporaryRoot, 'pack')
    await mkdir(packDirectory)
    const expectedFiles = JSON.parse(
      await readFile(
        path.join(import.meta.dirname, 'package-files.json'),
        'utf8',
      ),
    )
    const { stdout } = await run('npm', [
      'pack',
      '--json',
      '--pack-destination',
      packDirectory,
    ])
    const [pack] = JSON.parse(stdout)
    assert.ok(pack, 'npm pack did not report an artifact')
    validatePackedFiles(
      pack.files.map(({ path: file }) => file),
      expectedFiles,
    )
    assert.ok(pack.size < 40_000, `Tarball is too large: ${pack.size} bytes`)
    await verifyTarballConsumers(path.join(packDirectory, pack.filename))
    console.log(
      `Packed package verified (${pack.entryCount} files, ${pack.size} bytes)`,
    )
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

async function verifyModulesAndSsr(consumer) {
  const esm = await run(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import React from 'react'
        import { renderToString } from 'react-dom/server'
        import * as api from '${packageName}'

        if (JSON.stringify(Object.keys(api).sort()) !== '["DragDismiss"]') {
          throw new Error('ESM runtime exports differ from the public contract')
        }
        const html = renderToString(
          React.createElement(api.DragDismiss, null, 'SSR content'),
        )
        if (!html.includes('SSR content') || !html.includes('data-state="idle"')) {
          throw new Error('ESM server render did not preserve the public contract')
        }
      `,
    ],
    consumer,
  )
  assert.equal(esm.stderr, '')

  const cjs = await run(
    process.execPath,
    [
      '--input-type=commonjs',
      '--eval',
      `
        const api = require('${packageName}')
        if (JSON.stringify(Object.keys(api).sort()) !== '["DragDismiss"]') {
          throw new Error('CommonJS runtime exports differ from the public contract')
        }
      `,
    ],
    consumer,
  )
  assert.equal(cjs.stderr, '')
}

async function verifyTypes(consumer) {
  await writeFile(
    path.join(consumer, 'index.tsx'),
    `
      import {
        DragDismiss,
        type DragDismissDirection,
        type DragDismissEndEvent,
        type DragDismissEvent,
        type DragDismissProps,
      } from '${packageName}'

      const direction: DragDismissDirection = 'start'
      const dismissEvent: DragDismissEvent = { direction }
      const endEvent: DragDismissEndEvent = {
        dismissed: true,
        direction: dismissEvent.direction,
      }
      const props: DragDismissProps = {
        children: 'Typed consumer',
        directions: [direction, 'end'],
        onDismiss(event) {
          void event.direction
        },
        onDragEnd(event) {
          void event.dismissed
        },
      }

      void endEvent
      void <DragDismiss {...props} />
    `,
  )
  await writeFile(
    path.join(consumer, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          jsx: 'react-jsx',
          strict: true,
          exactOptionalPropertyTypes: true,
          noUncheckedIndexedAccess: true,
          noEmit: true,
          skipLibCheck: false,
          types: [],
        },
        include: ['index.tsx'],
      },
      null,
      2,
    )}\n`,
  )

  await run(
    process.execPath,
    [
      path.join(repositoryRoot, 'node_modules/typescript/bin/tsc'),
      '--project',
      'tsconfig.json',
    ],
    consumer,
  )
}

async function verifyStylesAndManifest(consumer) {
  const require = createRequire(path.join(consumer, 'package.json'))
  const stylesheetPath = require.resolve(`${packageName}/core.css`)
  assert.ok(
    (await readFile(stylesheetPath, 'utf8')).trim().length > 0,
    'core.css must contain CSS',
  )

  const manifest = JSON.parse(
    await readFile(require.resolve(`${packageName}/package.json`), 'utf8'),
  )
  assert.deepEqual(manifest.dependencies ?? {}, {})
  assert.equal(manifest.peerDependencies?.react, '^18.3.0 || ^19.0.0')
  assert.deepEqual(manifest.exports, {
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.js',
      require: './dist/index.cjs',
    },
    './core.css': './dist/core.css',
    './package.json': './package.json',
  })
  for (const lifecycle of [
    'preinstall',
    'install',
    'postinstall',
    'prepublish',
    'prepublishOnly',
    'prepare',
  ]) {
    assert.equal(
      manifest.scripts?.[lifecycle],
      undefined,
      `Packed package must not contain a ${lifecycle} lifecycle script`,
    )
  }
}

function run(command, args, cwd = repositoryRoot, userConfig) {
  return execFileAsync(command, args, {
    cwd,
    env: sanitizeNpmEnvironment(
      process.env,
      userConfig ?? process.env.NPM_CONFIG_USERCONFIG ?? '',
    ),
    maxBuffer: 10 * 1024 * 1024,
  })
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  try {
    await verifyPackage()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
