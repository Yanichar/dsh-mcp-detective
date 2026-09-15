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
import type { ConfigSource, McpServersReport, SurfaceScope } from './wire.ts';
/** The slice of `ctx.tools` this scanner needs. */
export interface ToolSurface {
    /**
     * Model-facing schemas visible to one scope. Pass the calling agent to see
     * the agent-scoped layer as well — a bare call reads only the global layer
     * and misses preset- and project-registered MCP servers.
     */
    schemas(scope?: unknown): readonly {
        name?: unknown;
    }[];
}
/** One server row recovered from a config file. */
export interface ConfiguredServer {
    serverName: string;
    source: ConfigSource;
    transport?: string;
    target?: string;
}
/** Everything one scan needs. */
export interface ScanInput {
    tools: ToolSurface;
    /** Agent scope for the surface read; omitted reads the global view. */
    agent?: object;
    /** Session working directory, used to find `.dsh/mcp.json`. */
    cwd?: string;
    /** DSH home; defaults to `process.env.DSH_HOME`. */
    dshHome?: string;
    /** Profile name; when absent it is derived from `process.argv`. */
    profile?: string;
}
/**
 * Split a public MCP tool name back into its server namespace and raw name.
 * @param publicName - the registered tool name.
 * @returns the two parts, or `undefined` when this is not an MCP tool name.
 */
export declare function parseMcpToolName(publicName: string): {
    serverName: string;
    rawName: string;
} | undefined;
/** Group the tool surface by server namespace, keeping raw tool names. */
export declare function collectLoaded(schemas: readonly {
    name?: unknown;
}[]): Map<string, string[]>;
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
export declare function scanYamlServerRows(text: string, source: ConfigSource): ConfiguredServer[];
/**
 * Server rows declared by the project's own `.dsh/mcp.json` — the file
 * `dsh-project-mcp-bridge` loads per session.
 * @param cwd - session working directory.
 * @returns configured rows; empty when the file is absent or malformed.
 */
export declare function readProjectConfig(cwd: string | undefined): Promise<ConfiguredServer[]>;
/**
 * Which profile the current process booted, from `--profile <name>` or one of
 * the documented aliases.
 * @param argv - `process.argv`.
 * @returns the profile name, or `undefined` when it cannot be told.
 */
export declare function profileFromArgv(argv: readonly string[]): string | undefined;
/**
 * Server rows declared by cordis config: the booted profile's `cordis.yml` and
 * `cordis.patch.yml`, plus the home-level patch.
 * @param dshHome - DSH home directory.
 * @param profile - booted profile name; when absent the profile files are skipped.
 * @returns configured rows from every readable source.
 */
export declare function readProfileConfig(dshHome: string, profile: string | undefined): Promise<ConfiguredServer[]>;
/** Merge the two sources into the report the panel renders. */
export declare function buildReport(input: {
    loaded: Map<string, string[]>;
    configured: readonly ConfiguredServer[];
    scope: SurfaceScope;
    sessionId?: string;
    cwd?: string;
}): McpServersReport;
/**
 * Run one full scan: read the tool surface, read both config sources, merge.
 * @param input - surface, scope, and the paths config is read from.
 * @returns the report served to the browser half.
 */
export declare function scan(input: ScanInput): Promise<McpServersReport>;
