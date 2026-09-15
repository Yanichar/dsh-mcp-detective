/**
 * Wire contract between the host half and the browser half.
 *
 * Imported by both sides; the constants are inlined into whichever bundle
 * needs them, so this module must stay dependency-free (no node built-ins, no
 * React, no cordis) — the browser bundle inlines it verbatim.
 * @module dsh-mcp-detective/wire
 */

/** Same-origin endpoint the composer badges poll. */
export const SERVERS_API = '/api/mcp-detective/servers'

/** Which registration scope the tool surface was read from. */
export type SurfaceScope = 'agent' | 'global'

/** Where a configured server row came from. */
export type ConfigSource = 'profile' | 'project'

/** One MCP server, loaded or merely configured. */
export interface McpServerStatus {
  /** Local namespace from the server's config (`mcp__<serverName>__<tool>`). */
  serverName: string
  /** How many tools this server contributes to the model-facing tool surface. */
  toolCount: number
  /** `toolCount > 0`: the server is really in context right now. */
  loaded: boolean
  /** A config row naming this server exists (profile config or project `.dsh/mcp.json`). */
  configured: boolean
  /** Raw tool names, without the `mcp__<server>__` prefix. Sorted. */
  tools: string[]
  /** Config origin, when a row was found. */
  source?: ConfigSource
  /** `stdio` or `streamable-http`, when a config row was found. */
  transport?: string
  /** Command or URL from the config row, when found. For the hover panel. */
  target?: string
}

/** One poll's answer. */
export interface McpServersReport {
  /** Loaded servers first, then configured-but-idle ones; alphabetical inside each group. */
  servers: McpServerStatus[]
  /** Which tool surface the read used. `global` means no session could be resolved. */
  scope: SurfaceScope
  /** Session the report was resolved for, when the browser passed one. */
  sessionId?: string
  /** Session working directory used to locate `.dsh/mcp.json`, when known. */
  cwd?: string
  /** Epoch ms of this read. Polling is every 10s, so this is at most that stale. */
  scannedAt: number
  /**
   * Servers in context with no config row anywhere — registered by a preset,
   * an agent preset, or another plugin. Kept separate so the panel can say
   * "in context, origin unknown" instead of inventing a config.
   */
  unmatched: string[]
}

/** Response envelope of {@link SERVERS_API}. */
export type ServersResponse =
  | { ok: true; report: McpServersReport }
  | { ok: false; error: string }
