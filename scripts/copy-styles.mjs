import { copyFile } from 'node:fs/promises'

await copyFile(
  new URL('../src/core.css', import.meta.url),
  new URL('../dist/core.css', import.meta.url),
)
