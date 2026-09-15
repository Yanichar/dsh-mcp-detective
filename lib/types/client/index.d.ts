/**
 * MCP Detective browser half — seats the MCP roster into the composer tool row
 * and polls the host for it.
 *
 * Placement: `conversation.input.right` is the list seat the composer renders
 * FIRST inside its trailing row, immediately left of `conversation.input.model`
 * (the model name) and of the built-in context meter. Context Doctor occupies
 * the same seat at `order: 20`; registering at `order: 10` puts the MCP icons
 * to its left, which is the requested reading order:
 *
 *   [ MCP icons ][ Context Doctor ][ model name ][ meter ][ Stop ]
 *
 * @module dsh-mcp-detective/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
/** Required services. */
export declare const inject: string[];
export type { McpBadgesProps } from './McpBadges.tsx';
/**
 * Client plugin body: register the dictionaries and seat the roster once the
 * composer bar is on the ledger.
 * @param ctx - browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
