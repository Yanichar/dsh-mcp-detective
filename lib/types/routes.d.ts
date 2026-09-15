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
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { type ToolSurface } from './scan.ts';
/** Route construction input. */
export interface RoutesConfig {
    tools: ToolSurface;
    /** Agent registry: turns `session=<id>` into the scope the surface is read from. */
    agents?: {
        get(id: string): object | undefined;
    };
    /** Session registry: turns `session=<id>` into the working directory for `.dsh/mcp.json`. */
    sessions?: {
        get(id: string): {
            header?: {
                cwd?: string;
            };
        } | undefined;
    };
    /** Fallback directory when no session resolves. */
    defaultCwd?: string;
    /** Answer cache window in milliseconds. Default 2000. */
    cacheTtlMs?: number;
    /** DSH home override (tests); defaults to `DSH_HOME` inside the scanner. */
    dshHome?: string;
    /** Profile name override (tests); defaults to the booted profile. */
    profile?: string;
}
/** Read one query parameter (URL-decoded, first occurrence wins). */
export declare function parseQueryParam(url: string, key: string): string | undefined;
/**
 * Build the roster route.
 * @param config - surface, registries, and cache window.
 * @returns the single route to register on `ctx.webServer`.
 */
export declare function makeRoutes(config: RoutesConfig): WebRoute[];
