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
import { McpBadges } from "./McpBadges.js";
import { NS, en, zh } from "./locales.js";
/** Required services. */
export const inject = ['slots', 'locale'];
/**
 * Client plugin body: register the dictionaries and seat the roster once the
 * composer bar is on the ledger.
 * @param ctx - browser plugin context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mcp-detective: dictionaries');
    ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right',
        // List seat: `id` identifies this occupant, `order` fixes its place.
        // 10 < Context Doctor's 20, so the icons land to its left.
        id: 'mcp-detective',
        order: 10,
        locale: NS,
    }, McpBadges));
}
