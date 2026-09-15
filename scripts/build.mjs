#!/usr/bin/env node
/**
 * Build the plugin: `tsc` emits the typed JS + declarations into `lib/types/`,
 * then `tsdown` bundles the host half into `lib/index.js` and the browser half
 * into `lib/client.js`.
 *
 * Both tool binaries run through `process.execPath` rather than the
 * `node_modules/.bin` shims, so one script works on Windows and POSIX without a
 * shell, and stdio is inherited so the compiler's own errors reach the terminal
 * verbatim.
 *
 * @module dsh-mcp-detective/scripts/build
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Run one tool entry point, failing the build on a nonzero exit. */
function run(label, entry, args, env) {
  if (!existsSync(entry)) {
    console.error(`build: ${label} is not installed (${entry}) — run \`pnpm install\` first`)
    process.exit(1)
  }
  console.log(`=== ${label} ===`)
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  if (result.error) {
    console.error(`build: ${label} failed to start: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('tsc (types + node half)', join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), ['-p', 'tsconfig.json'])
run('tsdown (host + client bundles)', join(ROOT, 'node_modules', 'tsdown', 'dist', 'run.mjs'), [
  '-c', 'tsdown.config.ts',
])

console.log('build: done — lib/index.js (host) and lib/client.js (browser)')
