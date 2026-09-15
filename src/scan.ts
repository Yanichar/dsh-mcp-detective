/**
 * Host-half scanner: the one place that answers "which MCP servers are loaded
 * into this session's context?".
 *
 * Two independent sources are merged, because neither alone answers it:
 *
 * 1. **The tool surface** — `ctx.tools.schemas(agent)` is exactly the schema
 *    list that goes to the model, and every MCP tool arrives under
 *    `mcp__<serverName>__<rawName>`. This is the *fact*: a server is loaded iff
 *    it contributed at least one tool here.
 * 2. **Config rows** — a server can be configured and still contribute nothing
 *    (initial connect failed, the server lists zero tools, the project bridge
 *    skipped it as a duplicate). Only the config says the name at all, so the
 *    panel can show it dimmed instead of silently omitting it.
 *
 * `dsh-mcp-client` publishes no enumerable server registry (its live-name set
 * is a module-private `WeakMap`), so server identity is recovered from the
 * public tool name: the last `__` separates the server namespace from the raw
 * tool name. The `mcp__<serverName>__` prefix always survives the harness's
 * lossy-name normalization, which truncates from the *end* (the prefix is at
 * most 5 + 32 + 2 = 39 chars, under the 51-char budget), so attribution stays
 * correct even when the raw tool name is replaced by a hash.
 *
 * @module dsh-mcp-detective/scan
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ConfigSource, McpServerStatus, McpServersReport, SurfaceScope } from './wire.ts'

/** The slice of `ctx.tools` this scanner needs. */
export interface ToolSurface {
  /**
   * Model-facing schemas visible to one scope. Pass the calling agent to see
   * the agent-scoped layer as well — a bare call reads only the global layer
   * and misses preset- and project-registered MCP servers.
   */
  schemas(scope?: unknown): readonly { name?: unknown }[]
}

/** One server row recovered from a config file. */
export interface ConfiguredServer {
  serverName: string
  source: ConfigSource
  transport?: string
  target?: string
}

/** Everything one scan needs. */
export interface ScanInput {
  tools: ToolSurface
  /** Agent scope for the surface read; omitted reads the global view. */
  agent?: object
  /** Session working directory, used to find `.dsh/mcp.json`. */
  cwd?: string
  /** DSH home; defaults to `process.env.DSH_HOME`. */
  dshHome?: string
  /** Profile name; when absent it is derived from `process.argv`. */
  profile?: string
}

const MCP_PREFIX = 'mcp__'
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/**
 * Split a public MCP tool name back into its server namespace and raw name.
 * @param publicName - the registered tool name.
 * @returns the two parts, or `undefined` when this is not an MCP tool name.
 */
export function parseMcpToolName(publicName: string): { serverName: string; rawName: string } | undefined {
  if (!publicName.startsWith(MCP_PREFIX)) return undefined
  const body = publicName.slice(MCP_PREFIX.length)
  const at = body.lastIndexOf('__')
  // `at <= 0` also rejects `mcp__foo` (no separator at all).
  if (at <= 0) return undefined
  return { serverName: body.slice(0, at), rawName: body.slice(at + 2) }
}

/** Group the tool surface by server namespace, keeping raw tool names. */
export function collectLoaded(schemas: readonly { name?: unknown }[]): Map<string, string[]> {
  const byServer = new Map<string, string[]>()
  for (const schema of schemas) {
    if (typeof schema?.name !== 'string') continue
    const parsed = parseMcpToolName(schema.name)
    if (parsed === undefined) continue
    const list = byServer.get(parsed.serverName)
    if (list === undefined) byServer.set(parsed.serverName, [parsed.rawName])
    else list.push(parsed.rawName)
  }
  return byServer
}

/** Strip one layer of matching quotes and trailing YAML comment noise. */
function unquote(value: string): string {
  const trimmed = value.trim()
  const withoutComment = trimmed.startsWith("'") || trimmed.startsWith('"')
    ? trimmed
    : (trimmed.split(' #')[0] ?? trimmed).trim()
  const first = withoutComment[0]
  if ((first === "'" || first === '"') && withoutComment.endsWith(first) && withoutComment.length > 1) {
    return withoutComment.slice(1, -1)
  }
  return withoutComment
}

/** Whether a YAML `name:` value denotes the official MCP client plugin row. */
function isMcpClientRow(name: string): boolean {
  return name === 'mcp-client' || name.endsWith('/dsh-mcp-client') || name === 'dsh-mcp-client'
}

/**
 * Recover `serverName` rows from a cordis YAML file without a YAML parser.
 *
 * The dependency is deliberately avoided: a host-half dependency that the
 * profile cannot resolve is a boot failure, and the shapes we read are a flat
 * list of `- name: <plugin>` rows with scalar keys nested under `config:`.
 * Anything the scanner does not understand yields fewer rows, never a throw.
 * @param text - raw YAML file contents.
 * @param source - config origin stamped on every recovered row.
 * @returns one row per MCP client entry that declared a valid `serverName`.
 */
export function scanYamlServerRows(text: string, source: ConfigSource): ConfiguredServer[] {
  const rows: ConfiguredServer[] = []
  let current: Record<string, string> | undefined

  const flush = (): void => {
    const name = current?.['serverName']
    if (name !== undefined && SERVER_NAME_PATTERN.test(name)) {
      const transport = current?.['transport']
      const cmd = current?.['command']
      const url = current?.['url']
      const target = transport === 'streamable-http' ? url : (cmd ?? url)
      rows.push({
        serverName: name,
        source,
        ...(transport !== undefined ? { transport } : {}),
        ...(target !== undefined ? { target } : {}),
      })
    }
    current = undefined
  }

  for (const line of text.split(/\r?\n/)) {
    const item = /^(\s*)-\s+(.*)$/.exec(line)
    if (item !== null) {
      flush()
      const inlineName = /(?:^|\s)name:\s*(.+)$/.exec(item[2] ?? '')
      const named = inlineName === null ? undefined : unquote(inlineName[1] ?? '')
      current = named !== undefined && isMcpClientRow(named) ? {} : undefined
      continue
    }
    if (current === undefined) continue
    const kv = /^\s*([A-Za-z][A-Za-z0-9_]*):\s*(.+)$/.exec(line)
    if (kv === null) continue
    const key = kv[1]
    if (key === undefined) continue
    current[key] = unquote(kv[2] ?? '')
  }
  flush()
  return rows
}

/** Read a file, mapping every failure (including ENOENT) to `undefined`. */
async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Server rows declared by the project's own `.dsh/mcp.json` — the file
 * `dsh-project-mcp-bridge` loads per session.
 * @param cwd - session working directory.
 * @returns configured rows; empty when the file is absent or malformed.
 */
export async function readProjectConfig(cwd: string | undefined): Promise<ConfiguredServer[]> {
  if (cwd === undefined || cwd === '') return []
  const text = await readText(join(cwd, '.dsh', 'mcp.json'))
  if (text === undefined) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const servers = (parsed as { mcpServers?: unknown } | null)?.mcpServers
  if (servers === null || typeof servers !== 'object' || Array.isArray(servers)) return []
  const rows: ConfiguredServer[] = []
  for (const [serverName, raw] of Object.entries(servers as Record<string, unknown>)) {
    if (!SERVER_NAME_PATTERN.test(serverName)) continue
    const entry = (raw ?? {}) as Record<string, unknown>
    const command = typeof entry['command'] === 'string' ? entry['command'] : undefined
    const url = typeof entry['url'] === 'string' ? entry['url'] : undefined
    const transport = command !== undefined ? 'stdio' : url !== undefined ? 'streamable-http' : undefined
    const target = command ?? url
    rows.push({
      serverName,
      source: 'project',
      ...(transport !== undefined ? { transport } : {}),
      ...(target !== undefined ? { target } : {}),
    })
  }
  return rows
}

/**
 * Which profile the current process booted, from `--profile <name>` or one of
 * the documented aliases.
 * @param argv - `process.argv`.
 * @returns the profile name, or `undefined` when it cannot be told.
 */
export function profileFromArgv(argv: readonly string[]): string | undefined {
  const at = argv.indexOf('--profile')
  const named = at >= 0 ? argv[at + 1] : undefined
  if (named !== undefined && named !== '' && !named.startsWith('-')) return named
  for (const alias of ['web', 'headless', 'sdk', 'sdk-minimal', 'acp']) {
    if (argv.includes(alias)) return alias
  }
  return undefined
}

/**
 * Server rows declared by cordis config: the booted profile's `cordis.yml` and
 * `cordis.patch.yml`, plus the home-level patch.
 * @param dshHome - DSH home directory.
 * @param profile - booted profile name; when absent the profile files are skipped.
 * @returns configured rows from every readable source.
 */
export async function readProfileConfig(dshHome: string, profile: string | undefined): Promise<ConfiguredServer[]> {
  const paths: string[] = []
  if (profile !== undefined) {
    paths.push(join(dshHome, 'profiles', profile, 'cordis.yml'))
    paths.push(join(dshHome, 'profiles', profile, 'cordis.patch.yml'))
  }
  paths.push(join(dshHome, 'cordis.patch.yml'))
  const texts = await Promise.all(paths.map((path) => readText(path)))
  const rows: ConfiguredServer[] = []
  for (const text of texts) {
    if (text !== undefined) rows.push(...scanYamlServerRows(text, 'profile'))
  }
  return rows
}

/** Merge the two sources into the report the panel renders. */
export function buildReport(input: {
  loaded: Map<string, string[]>
  configured: readonly ConfiguredServer[]
  scope: SurfaceScope
  sessionId?: string
  cwd?: string
}): McpServersReport {
  const { loaded, configured, scope } = input
  const byName = new Map<string, ConfiguredServer>()
  for (const row of configured) {
    // Project rows win over profile rows: it is the one the session actually loads.
    const existing = byName.get(row.serverName)
    if (existing === undefined || (existing.source === 'profile' && row.source === 'project')) {
      byName.set(row.serverName, row)
    }
  }

  const names = new Set<string>([...loaded.keys(), ...byName.keys()])
  const servers: McpServerStatus[] = []
  for (const name of names) {
    const tools = loaded.get(name) ?? []
    const row = byName.get(name)
    servers.push({
      serverName: name,
      toolCount: tools.length,
      loaded: tools.length > 0,
      configured: row !== undefined,
      tools: [...tools].sort(),
      ...(row?.source !== undefined ? { source: row.source } : {}),
      ...(row?.transport !== undefined ? { transport: row.transport } : {}),
      ...(row?.target !== undefined ? { target: row.target } : {}),
    })
  }
  servers.sort((left, right) => {
    if (left.loaded !== right.loaded) return left.loaded ? -1 : 1
    return left.serverName.localeCompare(right.serverName)
  })

  return {
    servers,
    scope,
    scannedAt: Date.now(),
    unmatched: [...loaded.keys()].filter((name) => !byName.has(name)).sort(),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
  }
}

/**
 * Run one full scan: read the tool surface, read both config sources, merge.
 * @param input - surface, scope, and the paths config is read from.
 * @returns the report served to the browser half.
 */
export async function scan(input: ScanInput): Promise<McpServersReport> {
  const { tools, agent } = input
  const dshHome = input.dshHome ?? process.env['DSH_HOME'] ?? ''
  const profile = input.profile ?? profileFromArgv(process.argv)

  const schemas = agent === undefined ? tools.schemas() : tools.schemas(agent)
  const loaded = collectLoaded(schemas)

  const [project, profileRows] = await Promise.all([
    readProjectConfig(input.cwd),
    dshHome === '' ? Promise.resolve<ConfiguredServer[]>([]) : readProfileConfig(dshHome, profile),
  ])

  return buildReport({
    loaded,
    configured: [...profileRows, ...project],
    scope: agent === undefined ? 'global' : 'agent',
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
  })
}
