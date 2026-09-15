/**
 * MCP Detective's composer control: one badge per MCP server, plus a panel that
 * says exactly what each one is contributing.
 *
 * The control is a roster, not a meter: it answers "which MCP servers are
 * actually in this session's context right now". A server is coloured when it
 * contributes at least one tool to the model-facing surface, and drawn dimmed
 * when it is only configured (initial connect failed, it lists no tools, the
 * project bridge skipped it as a duplicate) — the difference between the two is
 * the whole point, so it must be legible at a glance without opening anything.
 *
 * Freshness: fetch on mount, then every 10s, plus an immediate refresh when the
 * tab becomes visible again. A hidden tab stops polling — its answer is stale by
 * definition and the visibility handler catches it up.
 *
 * Typography rule: text inherits the DSH shell's own UI font (the panel sets no
 * family), and monospace is applied only to figures, server names, and config
 * targets — never to a sentence that may carry CJK.
 *
 * @module dsh-mcp-detective/client/McpBadges
 */
import { type ReactElement } from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { NS } from './locales.ts';
export type McpBadgesProps = PropsRuntime<'conversation.input.right'> & PropsLocale<typeof NS>;
/**
 * The composer roster control.
 * @param props - slot runtime props (session identity) plus the locale `t` seat.
 * @returns the badge row, or nothing before the first answer arrives.
 */
export declare function McpBadges(props: McpBadgesProps): ReactElement | null;
