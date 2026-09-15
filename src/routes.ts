/**
 * Host-half HTTP route: the browser half polls this for the current MCP
 * roster. Same-origin JSON, same shape as the other DSH panel endpoints.
 *
 * The read is cheap (one in-memory schema projection plus two small config
 * files) but the panel polls every 10s from every open tab, so answers are
 * memoized for a couple of seconds. The window is deliberately far below the
 * poll interval: a server that finishes connecting, or an mcp.json edit, has
 * to show up on the next tick rather than a minute later — that responsiveness
 * is the whole point of this plugin next to the 60s audit cache.
 *
 * @module dsh-mcp-detective/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { scan, type ToolSurface } from './scan.ts'
import { SERVERS_API, type McpServersReport, type ServersResponse } from './wire.ts'

/** Route construction input. */
export interface RoutesConfig {
  tools: ToolSurface
  /** Agent registry: turns `session=<id>` into the scope the surface is read from. */
  agents?: { get(id: string): object | undefined }
  /** Session registry: turns `session=<id>` into the working directory for `.dsh/mcp.json`. */
  sessions?: { get(id: string): { header?: { cwd?: string } } | undefined }
  /** Fallback directory when no session resolves. */
  defaultCwd?: string
  /** Answer cache window in milliseconds. Default 2000. */
  cacheTtlMs?: number
  /** DSH home override (tests); defaults to `DSH_HOME` inside the scanner. */
  dshHome?: string
  /** Profile name override (tests); defaults to the booted profile. */
  profile?: string
}

/** Write one JSON response. */
function json(res: ServerResponse, status: number, body: ServersResponse): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

/** Read one query parameter (URL-decoded, first occurrence wins). */
export function parseQueryParam(url: string, key: string): string | undefined {
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
  for (const part of query.split('&')) {
    if (!part.startsWith(`${key}=`)) continue
    try {
      return decodeURIComponent(part.slice(key.length + 1))
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * Build the roster route.
 * @param config - surface, registries, and cache window.
 * @returns the single route to register on `ctx.webServer`.
 */
export function makeRoutes(config: RoutesConfig): WebRoute[] {
  const cacheTtlMs = config.cacheTtlMs ?? 2_000
  const cache = new Map<string, { at: number; promise: Promise<McpServersReport> }>()
  /** Bound so a long-lived browser tab cannot grow the map without limit. */
  const MAX_CACHE_ENTRIES = 16

  const cached = (key: string, run: () => Promise<McpServersReport>): Promise<McpServersReport> => {
    const hit = cache.get(key)
    if (hit !== undefined && Date.now() - hit.at < cacheTtlMs) return hit.promise
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    const promise = run().catch((error: unknown) => {
      // Failures are never cached: the next poll retries.
      cache.delete(key)
      throw error
    })
    cache.set(key, { at: Date.now(), promise })
    return promise
  }

  return [{
    kind: 'exact',
    path: SERVERS_API,
    handler: (req: IncomingMessage, res: ServerResponse): void => {
      if (req.method !== 'GET') {
        json(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      const url = req.url ?? ''
      const sessionId = parseQueryParam(url, 'session')
      const explicitCwd = parseQueryParam(url, 'cwd')
      const session = sessionId === undefined || sessionId === '' ? undefined : config.sessions?.get(sessionId)
      const sessionCwd = session?.header?.cwd
      const cwd = explicitCwd ?? (sessionCwd !== undefined && sessionCwd !== '' ? sessionCwd : undefined)
        ?? config.defaultCwd
      // The agent is the scope key for the surface read. Without it the read
      // sees only the global layer, which silently hides every server a preset
      // or the project bridge registered into the agent layer.
      const agent = sessionId === undefined || sessionId === '' ? undefined : config.agents?.get(sessionId)

      const key = `${sessionId ?? ''}|${agent !== undefined ? 'agent' : 'global'}|${cwd ?? ''}`
      cached(key, () => scan({
        tools: config.tools,
        ...(agent !== undefined ? { agent } : {}),
        ...(cwd !== undefined ? { cwd } : {}),
        ...(config.dshHome !== undefined ? { dshHome: config.dshHome } : {}),
        ...(config.profile !== undefined ? { profile: config.profile } : {}),
      })).then(
        (report) => {
          json(res, 200, {
            ok: true,
            report: sessionId !== undefined && sessionId !== '' ? { ...report, sessionId } : report,
          })
        },
        (error: unknown) => {
          json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        },
      )
    },
  }]
}
