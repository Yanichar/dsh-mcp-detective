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
import { makeRoutes } from "./routes.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'mcp-detective';
/** Services required by this plugin. */
export const inject = ['tools'];
/**
 * Plugin body.
 * @param ctx - plugin context carrying the tool registry.
 * @param config - cache window and fallback directory.
 */
export function apply(ctx, config = {}) {
    const agents = ctx.get('agents');
    const sessions = ctx.get('sessions');
    const routes = makeRoutes({
        tools: ctx.tools,
        ...(agents !== undefined ? { agents } : {}),
        ...(sessions !== undefined ? { sessions } : {}),
        ...(config.defaultCwd !== undefined ? { defaultCwd: config.defaultCwd } : {}),
        ...(config.cacheTtlMs !== undefined ? { cacheTtlMs: config.cacheTtlMs } : {}),
    });
    // webServer is an optional capability: the web profile has it, headless and
    // CLI profiles do not. Absent, the plugin simply contributes nothing —
    // there is no UI to feed and nothing else to do.
    ctx.inject(['webServer'], (httpCtx) => {
        httpCtx.effect(() => {
            const disposers = routes.map((route) => httpCtx.webServer.register(route));
            return () => {
                for (const dispose of disposers)
                    dispose();
            };
        }, 'mcp-detective: routes');
    });
}
