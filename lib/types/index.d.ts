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
import type { Context } from '@deepseek-ai/cordis';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "mcp-detective";
/** Services required by this plugin. */
export declare const inject: readonly ["tools"];
/** Plugin configuration. */
export interface Config {
    /**
     * How long one roster answer is reused, in milliseconds. Default 2000.
     * Keep it well under the browser's 10s poll: this is the knob that decides
     * how fast a freshly connected (or freshly edited) MCP server appears.
     */
    cacheTtlMs?: number;
    /** Directory to read `.dsh/mcp.json` from when no session resolves. */
    defaultCwd?: string;
}
/**
 * Plugin body.
 * @param ctx - plugin context carrying the tool registry.
 * @param config - cache window and fallback directory.
 */
export declare function apply(ctx: Context, config?: Config): void;
