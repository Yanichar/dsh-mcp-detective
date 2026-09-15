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

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only imports: they pull the Context augmentations (`ctx.locale`,
// `ctx.slots`) and the `conversation.input.*` SlotMap entries this plugin
// registers into. All erased at build time, so the client bundle stays free of
// cross-plugin value imports.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: merges `sessionId` into SessionStandardProps, which every
// session-scoped slot component receives. Without it the augmentation is
// absent and the component cannot type its own session identity.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { McpBadges } from './McpBadges.tsx'
import { NS, en, zh } from './locales.ts'

/** Required services. */
export const inject = ['slots', 'locale']

export type { McpBadgesProps } from './McpBadges.tsx'

/**
 * Client plugin body: register the dictionaries and seat the roster once the
 * composer bar is on the ledger.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mcp-detective: dictionaries')

  ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register({
      name: 'conversation.input.right',
      // List seat: `id` identifies this occupant, `order` fixes its place.
      // 10 < Context Doctor's 20, so the icons land to its left.
      id: 'mcp-detective',
      order: 10,
      locale: NS,
    }, McpBadges))
}
