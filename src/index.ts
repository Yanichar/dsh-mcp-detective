/**
 * MCP Detective — host half.
 *
 * Registers one read-only same-origin route, `GET /api/mcp-detective/servers`,
 * that answers which MCP servers are loaded into the calling session's context.
 * The browser half (`./client`) renders those servers as icons in the composer
 * tool row and polls this route every 10 seconds.
 *
 * There is no model-facing tool on purpose: the plugin reports a UI fact, and
 * adding a tool would put a schema into the very context it exists to measure.
 *
 * @module dsh-mcp-detective
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only side-effect imports: pull each package's `declare module
// '@deepseek-ai/cordis'` Context augmentation (tools / webServer / sessions)
// into this compilation unit. They are erased at build time.
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session'
import { makeRoutes } from './routes.ts'
import type { ToolSurface } from './scan.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mcp-detective'

/** Services required by this plugin. */
export const inject = ['tools'] as const

/** Plugin configuration. */
export interface Config {
  /**
   * How long one roster answer is reused, in milliseconds. Default 2000.
   * Keep it well under the browser's 10s poll: this is the knob that decides
   * how fast a freshly connected (or freshly edited) MCP server appears.
   */
  cacheTtlMs?: number
  /** Directory to read `.dsh/mcp.json` from when no session resolves. */
  defaultCwd?: string
}

/**
 * Plugin body.
 * @param ctx - plugin context carrying the tool registry.
 * @param config - cache window and fallback directory.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const agents = ctx.get('agents') as { get(id: string): object | undefined } | undefined
  const sessions = ctx.get('sessions') as
    { get(id: string): { header?: { cwd?: string } } | undefined } | undefined

  const routes = makeRoutes({
    tools: ctx.tools as unknown as ToolSurface,
    ...(agents !== undefined ? { agents } : {}),
    ...(sessions !== undefined ? { sessions } : {}),
    ...(config.defaultCwd !== undefined ? { defaultCwd: config.defaultCwd } : {}),
    ...(config.cacheTtlMs !== undefined ? { cacheTtlMs: config.cacheTtlMs } : {}),
  })

  // webServer is an optional capability: the web profile has it, headless and
  // CLI profiles do not. Absent, the plugin simply contributes nothing —
  // there is no UI to feed and nothing else to do.
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(() => {
      const disposers = routes.map((route) => httpCtx.webServer.register(route))
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'mcp-detective: routes')
  })
}
