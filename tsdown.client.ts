/**
 * Self-contained tsdown preset for this package's browser client bundle — a
 * trimmed port of the DSH checkout's `packages/client/tsdown.client.ts`, the
 * official shape for `dsh.client` plugin bundles. It must not import anything
 * from the DSH monorepo, so this repo builds standalone against the published
 * `@deepseek-ai/*` packages.
 *
 * The emitted artifact is the closure factory the loader expects: the bundle
 * calls `window.__ModuleLoader__.load({ id, factory })` and resolves externals
 * through the injected require (the loader's platform module table — no
 * globals, no import map).
 *
 * This plugin styles everything inline and imports no CSS, so the upstream
 * preset's lightningcss/CSS-Modules half is deliberately absent rather than
 * vendored dead.
 */
import type { UserConfig } from 'tsdown'

/**
 * Externals resolved from the loader's platform module table — the shared
 * browser modules the shell seeds. This list is a hard dependency on one
 * harness generation and must be re-checked on every DSH upgrade.
 *
 * Kept to the two entries this plugin actually requires. A `require()` the
 * table cannot answer is a guaranteed runtime throw that takes the whole web
 * shell down, so every additional external is another way to break boot; the
 * purity gate below turns any other `@deepseek-ai/*` value import into a build
 * error instead of a boot failure.
 */
const CLIENT_EXTERNALS: readonly string[] = ['react', 'react/jsx-runtime']

/**
 * Host-half externals: every runtime the harness itself owns. Inlining one of
 * these mints a second copy of a process singleton — a second `ToolRuntime`, a
 * second `TOOL_RUNTIME_SCHEDULER` symbol — and the host's tool dispatch then
 * reads `undefined`, taking down tool calls mid-turn. The harness resolves
 * these from the profile's node_modules, so they stay bare imports in the
 * emitted bundle.
 */
const HOST_EXTERNAL = /^(?:@deepseek-ai\/|cordis(?:\/|$))/

/**
 * Build the two tsdown configs: the node-half lib build plus the browser
 * client bundle. Both halves land in `lib/`; `clean` stays off because the two
 * configs share the output directory.
 * @param id - plugin id (package name), stamped into the `__ModuleLoader__.load` handoff.
 * @param libEntry - node-half entries (the tsc-emitted `lib/types/*.js`).
 * @returns the emitted configs.
 */
export function clientBundle(id: string, libEntry: readonly string[]): UserConfig[] {
  return [{
    name: id,
    entry: [...libEntry],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    external: [HOST_EXTERNAL],
    plugins: [{
      // Belt to the `external` braces: tsdown only auto-externalizes declared
      // dependencies, and a linked dev checkout can resolve host packages to
      // absolute paths before the bare id ever reaches the external matcher.
      // Pinning them external at resolve time is what actually holds.
      name: 'dsh-host-bundle-externals',
      resolveId(source: string) {
        return HOST_EXTERNAL.test(source) ? { id: source, external: true } : null
      },
    }],
  }, clientConfig(id)]
}

/** The browser bundle config. */
function clientConfig(id: string): UserConfig {
  return {
    name: `${id}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    // tsdown auto-externalizes package dependencies; anything NOT in the
    // loader module table must inline instead. A require() the table cannot
    // answer is a guaranteed runtime throw, so the rule is the table itself.
    noExternal: (source: string) => (CLIENT_EXTERNALS.includes(source) ? undefined : true),
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [{
      // Bundle purity gate: a platform module stays external, anything else
      // under @deepseek-ai/ is a build error. Cross-plugin value imports are
      // forbidden — collaborate through cordis services. Type-only imports are
      // erased and never reach this hook, which is why the client half can name
      // harness packages freely and still pass.
      name: 'dsh-client-bundle-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (CLIENT_EXTERNALS.includes(source)) return null
        throw new Error(
          `client bundle purity: "${source}" is not in the loader module table (CLIENT_EXTERNALS) — `
          + 'cross-plugin value imports are forbidden; collaborate through cordis services '
          + '(type-only imports are erased and never reach this gate)',
        )
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}
