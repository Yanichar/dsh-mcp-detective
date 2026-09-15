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

import {
  useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement,
} from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pull the `conversation.input.right` SlotMap entry this component
// is seated into, and the `sessionId` merge every session-scoped slot receives.
// Both are erased at build time.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { SERVERS_API, type McpServerStatus, type McpServersReport, type ServersResponse } from '../wire.ts'
import { NS } from './locales.ts'

export type McpBadgesProps = PropsRuntime<'conversation.input.right'> & PropsLocale<typeof NS>

/** Poll cadence. The host caches far shorter than this, so a change lands on the next tick. */
const POLL_MS = 10_000
/** Badges rendered before the rest collapse into a `+N` chip. */
const MAX_ICONS = 5
/** Tool chips listed per server before `+N more`. */
const MAX_TOOL_CHIPS = 8

/** Shell design tokens, with the same literal fallbacks the other panels use. */
const TONE = {
  canvas: 'var(--dsw-alias-bg-layer-1, #161b24)',
  raised: 'var(--dsw-alias-bg-layer-2, #1d2430)',
  sunk: 'var(--dsw-alias-bg-layer-3, #252d3b)',
  border: 'var(--dsw-alias-border-l2, rgba(196, 211, 232, 0.16))',
  borderStrong: 'var(--dsw-alias-border-l3, rgba(196, 211, 232, 0.3))',
  text: 'var(--dsw-alias-label-primary, #e9edf4)',
  muted: 'var(--dsw-alias-label-secondary, #9ba5b5)',
  quiet: 'var(--dsw-alias-label-tertiary, #707a8b)',
  mint: 'var(--dsw-alias-state-success-primary, #4fc281)',
  red: 'var(--dsw-alias-state-error-primary, #ef6a7d)',
} as const

/** Figures, server names, and config targets only — never a sentence. */
const MONO = 'ui-monospace, "SFMono-Regular", "Cascadia Mono", Consolas, monospace'

/** Deterministic hue in degrees, so a server keeps its colour across reloads. */
function hueOf(name: string): number {
  let hash = 0
  for (let index = 0; index < name.length; index++) {
    hash = (hash * 31 + name.charCodeAt(index)) % 360
  }
  return hash
}

/** Two-letter monogram from the server name (`dsh_mcp` → `DM`, `github` → `GI`). */
function initialsOf(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  const head = parts[0]
  if (head === undefined) return '??'
  const second = parts[1]
  if (second !== undefined) return `${head[0] ?? ''}${second[0] ?? ''}`.toUpperCase()
  return head.slice(0, 2).toUpperCase()
}

/** Badge colours: saturated when loaded, grey when only configured. */
function badgeStyle(server: McpServerStatus): CSSProperties {
  const hue = hueOf(server.serverName)
  if (!server.loaded) {
    return {
      background: 'transparent',
      borderColor: TONE.border,
      borderStyle: 'dashed',
      color: TONE.quiet,
    }
  }
  return {
    background: `hsl(${hue} 45% 26%)`,
    borderColor: `hsl(${hue} 62% 52%)`,
    borderStyle: 'solid',
    color: `hsl(${hue} 85% 78%)`,
  }
}

/** The portrait square used in both the row and the panel. */
function portraitStyle(server: McpServerStatus, size: number): CSSProperties {
  return {
    ...badgeStyle(server),
    width: `${size}px`,
    height: `${size}px`,
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: '1px',
    borderRadius: `${Math.round(size * 0.32)}px`,
    fontFamily: MONO,
    fontSize: `${Math.max(8, Math.round(size * 0.42))}px`,
    fontWeight: 700,
    letterSpacing: '0.02em',
    lineHeight: 1,
    userSelect: 'none',
  }
}

/** Reset shared by every clickable affordance in this control. */
const BUTTON_RESET: CSSProperties = {
  appearance: 'none',
  padding: 0,
  margin: 0,
  font: 'inherit',
  cursor: 'pointer',
}

const ROW: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  position: 'relative',
}

/** Relative-age label for the last successful read. */
function freshness(scannedAt: number, now: number, t: McpBadgesProps['t']): string {
  const seconds = Math.max(0, Math.round((now - scannedAt) / 1000))
  if (seconds < 5) return t('md.justNow')
  if (seconds < 60) return t('md.secondsAgo', { n: seconds })
  return t('md.minutesAgo', { n: Math.floor(seconds / 60) })
}

/**
 * The composer roster control.
 * @param props - slot runtime props (session identity) plus the locale `t` seat.
 * @returns the badge row, or nothing before the first answer arrives.
 */
export function McpBadges(props: McpBadgesProps): ReactElement | null {
  const { sessionId, t } = props
  const [report, setReport] = useState<McpServersReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const rootRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async (signal: AbortSignal): Promise<void> => {
    try {
      const response = await fetch(`${SERVERS_API}?session=${encodeURIComponent(String(sessionId))}`, {
        signal,
        headers: { accept: 'application/json' },
      })
      const body = await response.json() as ServersResponse
      if (signal.aborted) return
      if (!body.ok) {
        setError(body.error)
        return
      }
      setError(null)
      setReport(body.report)
      setNow(Date.now())
    } catch (cause: unknown) {
      if (signal.aborted) return
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [sessionId])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const timer = window.setInterval(() => {
      // A hidden tab's read is invisible; the visibility handler catches up.
      if (!document.hidden) void load(controller.signal)
    }, POLL_MS)
    const onVisibility = (): void => {
      if (!document.hidden) void load(controller.signal)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
      controller.abort()
    }
  }, [load])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: MouseEvent): void => {
      const root = rootRef.current
      if (root !== null && !root.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const refresh = useCallback((): void => {
    void load(new AbortController().signal)
  }, [load])

  // Nothing has arrived yet: render no seat rather than a placeholder that
  // would shift the composer row on every session switch.
  if (report === null) {
    if (error === null) return null
    return (
      <span style={{ ...ROW, color: TONE.red, fontSize: '11px' }} title={error}>
        {t('md.error')}
      </span>
    )
  }

  const servers = report.servers
  const visible = servers.slice(0, MAX_ICONS)
  const hidden = servers.length - visible.length
  const loadedCount = servers.filter((server) => server.loaded).length

  return (
    <div ref={rootRef} style={ROW}>
      {servers.length === 0
        ? (
            <span
              title={t('md.none')}
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                border: `1px dashed ${TONE.borderStrong}`,
                opacity: 0.6,
              }}
            />
          )
        : null}

      {visible.map((server) => (
        <button
          key={server.serverName}
          type="button"
          onClick={() => setOpen((value) => !value)}
          title={`${server.serverName} — ${server.loaded
            ? t(server.toolCount === 1 ? 'md.toolsOne' : 'md.toolsMany', { n: server.toolCount })
            : t('md.notLoaded')}`}
          aria-label={server.serverName}
          aria-expanded={open}
          style={{ ...BUTTON_RESET, ...portraitStyle(server, 22), position: 'relative' }}
        >
          {initialsOf(server.serverName)}
          {server.loaded
            ? (
                <span
                  style={{
                    position: 'absolute',
                    right: '-1px',
                    bottom: '-1px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: TONE.mint,
                    boxShadow: `0 0 0 2px ${TONE.canvas}`,
                  }}
                />
              )
            : null}
        </button>
      ))}

      {hidden > 0
        ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              title={t('md.loadedMany', { n: servers.length })}
              style={{
                ...BUTTON_RESET,
                ...portraitStyle({ serverName: '', toolCount: 0, loaded: false, configured: false, tools: [] }, 22),
                fontFamily: MONO,
              }}
            >
              {`+${hidden}`}
            </button>
          )
        : null}

      {open ? <Roster report={report} now={now} onRefresh={refresh} onClose={() => setOpen(false)} t={t} /> : null}
    </div>
  )
}

/** Props of the expanded roster panel. */
interface RosterProps {
  report: McpServersReport
  now: number
  onRefresh: () => void
  onClose: () => void
  t: McpBadgesProps['t']
}

/** The expanded panel: every server, what it contributes, and where it came from. */
function Roster(props: RosterProps): ReactElement {
  const { report, now, onRefresh, onClose, t } = props
  const loadedCount = report.servers.filter((server) => server.loaded).length

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        right: 0,
        zIndex: 40,
        width: '300px',
        maxHeight: '60vh',
        overflowY: 'auto',
        padding: '10px 12px 12px',
        borderRadius: '12px',
        border: `1px solid ${TONE.borderStrong}`,
        background: TONE.canvas,
        boxShadow: '0 18px 40px rgba(0, 0, 0, 0.45)',
        color: TONE.text,
        fontSize: '12px',
        lineHeight: 1.45,
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontWeight: 600 }}>{t('md.title')}</span>
        <span style={{ flex: '1 1 auto' }} />
        <span style={{ color: TONE.quiet, fontSize: '11px' }}>
          {t('md.updated', { when: freshness(report.scannedAt, now, t) })}
        </span>
      </div>

      <div style={{ color: TONE.muted, fontSize: '11px', marginTop: '2px' }}>
        {loadedCount === 1 ? t('md.loadedOne') : t('md.loadedMany', { n: loadedCount })}
        {report.scope === 'global' ? ` · ${t('md.scopeGlobal')}` : ''}
      </div>

      {report.servers.length === 0
        ? <div style={{ color: TONE.quiet, marginTop: '8px' }}>{t('md.none')}</div>
        : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '10px' }}>
              {report.servers.map((server) => (
                <ServerRow key={server.serverName} server={server} t={t} />
              ))}
            </div>
          )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
        <button
          type="button"
          onClick={onRefresh}
          style={{
            ...BUTTON_RESET,
            padding: '3px 9px',
            borderRadius: '7px',
            border: `1px solid ${TONE.border}`,
            background: TONE.raised,
            color: TONE.muted,
            fontSize: '11px',
          }}
        >
          {t('md.refresh')}
        </button>
        <span style={{ flex: '1 1 auto' }} />
        <button
          type="button"
          onClick={onClose}
          style={{ ...BUTTON_RESET, padding: '3px 6px', background: 'transparent', border: 'none', color: TONE.quiet, fontSize: '11px' }}
        >
          {t('md.close')}
        </button>
      </div>
    </div>
  )
}

/** One server row inside the panel. */
function ServerRow(props: { server: McpServerStatus; t: McpBadgesProps['t'] }): ReactElement {
  const { server, t } = props
  const shown = server.tools.slice(0, MAX_TOOL_CHIPS)
  const rest = server.tools.length - shown.length

  const status = server.loaded
    ? t(server.toolCount === 1 ? 'md.toolsOne' : 'md.toolsMany', { n: server.toolCount })
    : t('md.notLoaded')
  const origin = server.source === 'project'
    ? t('md.sourceProject')
    : server.source === 'profile'
      ? t('md.sourceProfile')
      : t('md.unmatched')

  return (
    <div style={{ display: 'flex', gap: '9px' }}>
      <span style={{ ...portraitStyle(server, 26), marginTop: '1px' }}>{initialsOf(server.serverName)}</span>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 600 }}>{server.serverName}</span>
          <span style={{ flex: '1 1 auto' }} />
          <span style={{ color: server.loaded ? TONE.mint : TONE.quiet, fontSize: '10.5px', whiteSpace: 'nowrap' }}>
            {status}
          </span>
        </div>
        <div style={{ color: TONE.quiet, fontSize: '10.5px' }}>
          {origin}
          {server.target !== undefined && server.target !== ''
            ? <span style={{ fontFamily: MONO }}>{` · ${server.target}`}</span>
            : null}
        </div>
        {shown.length > 0
          ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' }}>
                {shown.map((tool) => (
                  <span
                    key={tool}
                    style={{
                      fontFamily: MONO,
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '5px',
                      background: TONE.sunk,
                      color: TONE.muted,
                    }}
                  >
                    {tool}
                  </span>
                ))}
                {rest > 0
                  ? <span style={{ fontSize: '10px', color: TONE.quiet }}>{t('md.more', { n: rest })}</span>
                  : null}
              </div>
            )
          : null}
      </div>
    </div>
  )
}
