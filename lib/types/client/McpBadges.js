import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useCallback, useEffect, useRef, useState, } from 'react';
import { SERVERS_API } from "../wire.js";
/** Poll cadence. The host caches far shorter than this, so a change lands on the next tick. */
const POLL_MS = 10_000;
/** Badges rendered before the rest collapse into a `+N` chip. */
const MAX_ICONS = 5;
/** Tool chips listed per server before `+N more`. */
const MAX_TOOL_CHIPS = 8;
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
};
/** Figures, server names, and config targets only — never a sentence. */
const MONO = 'ui-monospace, "SFMono-Regular", "Cascadia Mono", Consolas, monospace';
/** Deterministic hue in degrees, so a server keeps its colour across reloads. */
function hueOf(name) {
    let hash = 0;
    for (let index = 0; index < name.length; index++) {
        hash = (hash * 31 + name.charCodeAt(index)) % 360;
    }
    return hash;
}
/** Two-letter monogram from the server name (`dsh_mcp` → `DM`, `github` → `GI`). */
function initialsOf(name) {
    const parts = name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    const head = parts[0];
    if (head === undefined)
        return '??';
    const second = parts[1];
    if (second !== undefined)
        return `${head[0] ?? ''}${second[0] ?? ''}`.toUpperCase();
    return head.slice(0, 2).toUpperCase();
}
/** Badge colours: saturated when loaded, grey when only configured. */
function badgeStyle(server) {
    const hue = hueOf(server.serverName);
    if (!server.loaded) {
        return {
            background: 'transparent',
            borderColor: TONE.border,
            borderStyle: 'dashed',
            color: TONE.quiet,
        };
    }
    return {
        background: `hsl(${hue} 45% 26%)`,
        borderColor: `hsl(${hue} 62% 52%)`,
        borderStyle: 'solid',
        color: `hsl(${hue} 85% 78%)`,
    };
}
/** The portrait square used in both the row and the panel. */
function portraitStyle(server, size) {
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
    };
}
/** Reset shared by every clickable affordance in this control. */
const BUTTON_RESET = {
    appearance: 'none',
    padding: 0,
    margin: 0,
    font: 'inherit',
    cursor: 'pointer',
};
const ROW = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    position: 'relative',
};
/** Relative-age label for the last successful read. */
function freshness(scannedAt, now, t) {
    const seconds = Math.max(0, Math.round((now - scannedAt) / 1000));
    if (seconds < 5)
        return t('md.justNow');
    if (seconds < 60)
        return t('md.secondsAgo', { n: seconds });
    return t('md.minutesAgo', { n: Math.floor(seconds / 60) });
}
/**
 * The composer roster control.
 * @param props - slot runtime props (session identity) plus the locale `t` seat.
 * @returns the badge row, or nothing before the first answer arrives.
 */
export function McpBadges(props) {
    const { sessionId, t } = props;
    const [report, setReport] = useState(null);
    const [error, setError] = useState(null);
    const [open, setOpen] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const rootRef = useRef(null);
    const load = useCallback(async (signal) => {
        try {
            const response = await fetch(`${SERVERS_API}?session=${encodeURIComponent(String(sessionId))}`, {
                signal,
                headers: { accept: 'application/json' },
            });
            const body = await response.json();
            if (signal.aborted)
                return;
            if (!body.ok) {
                setError(body.error);
                return;
            }
            setError(null);
            setReport(body.report);
            setNow(Date.now());
        }
        catch (cause) {
            if (signal.aborted)
                return;
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    }, [sessionId]);
    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        const timer = window.setInterval(() => {
            // A hidden tab's read is invisible; the visibility handler catches up.
            if (!document.hidden)
                void load(controller.signal);
        }, POLL_MS);
        const onVisibility = () => {
            if (!document.hidden)
                void load(controller.signal);
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.clearInterval(timer);
            controller.abort();
        };
    }, [load]);
    useEffect(() => {
        if (!open)
            return undefined;
        const onPointerDown = (event) => {
            const root = rootRef.current;
            if (root !== null && !root.contains(event.target))
                setOpen(false);
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape')
                setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);
    const refresh = useCallback(() => {
        void load(new AbortController().signal);
    }, [load]);
    // Nothing has arrived yet: render no seat rather than a placeholder that
    // would shift the composer row on every session switch.
    if (report === null) {
        if (error === null)
            return null;
        return (_jsx("span", { style: { ...ROW, color: TONE.red, fontSize: '11px' }, title: error, children: t('md.error') }));
    }
    const servers = report.servers;
    const visible = servers.slice(0, MAX_ICONS);
    const hidden = servers.length - visible.length;
    const loadedCount = servers.filter((server) => server.loaded).length;
    return (_jsxs("div", { ref: rootRef, style: ROW, children: [servers.length === 0
                ? (_jsx("span", { title: t('md.none'), style: {
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        border: `1px dashed ${TONE.borderStrong}`,
                        opacity: 0.6,
                    } }))
                : null, visible.map((server) => (_jsxs("button", { type: "button", onClick: () => setOpen((value) => !value), title: `${server.serverName} — ${server.loaded
                    ? t(server.toolCount === 1 ? 'md.toolsOne' : 'md.toolsMany', { n: server.toolCount })
                    : t('md.notLoaded')}`, "aria-label": server.serverName, "aria-expanded": open, style: { ...BUTTON_RESET, ...portraitStyle(server, 22), position: 'relative' }, children: [initialsOf(server.serverName), server.loaded
                        ? (_jsx("span", { style: {
                                position: 'absolute',
                                right: '-1px',
                                bottom: '-1px',
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: TONE.mint,
                                boxShadow: `0 0 0 2px ${TONE.canvas}`,
                            } }))
                        : null] }, server.serverName))), hidden > 0
                ? (_jsx("button", { type: "button", onClick: () => setOpen((value) => !value), title: t('md.loadedMany', { n: servers.length }), style: {
                        ...BUTTON_RESET,
                        ...portraitStyle({ serverName: '', toolCount: 0, loaded: false, configured: false, tools: [] }, 22),
                        fontFamily: MONO,
                    }, children: `+${hidden}` }))
                : null, open ? _jsx(Roster, { report: report, now: now, onRefresh: refresh, onClose: () => setOpen(false), t: t }) : null] }));
}
/** The expanded panel: every server, what it contributes, and where it came from. */
function Roster(props) {
    const { report, now, onRefresh, onClose, t } = props;
    const loadedCount = report.servers.filter((server) => server.loaded).length;
    return (_jsxs("div", { style: {
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
        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: '8px' }, children: [_jsx("span", { style: { fontWeight: 600 }, children: t('md.title') }), _jsx("span", { style: { flex: '1 1 auto' } }), _jsx("span", { style: { color: TONE.quiet, fontSize: '11px' }, children: t('md.updated', { when: freshness(report.scannedAt, now, t) }) })] }), _jsxs("div", { style: { color: TONE.muted, fontSize: '11px', marginTop: '2px' }, children: [loadedCount === 1 ? t('md.loadedOne') : t('md.loadedMany', { n: loadedCount }), report.scope === 'global' ? ` · ${t('md.scopeGlobal')}` : ''] }), report.servers.length === 0
                ? _jsx("div", { style: { color: TONE.quiet, marginTop: '8px' }, children: t('md.none') })
                : (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '10px' }, children: report.servers.map((server) => (_jsx(ServerRow, { server: server, t: t }, server.serverName))) })), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }, children: [_jsx("button", { type: "button", onClick: onRefresh, style: {
                            ...BUTTON_RESET,
                            padding: '3px 9px',
                            borderRadius: '7px',
                            border: `1px solid ${TONE.border}`,
                            background: TONE.raised,
                            color: TONE.muted,
                            fontSize: '11px',
                        }, children: t('md.refresh') }), _jsx("span", { style: { flex: '1 1 auto' } }), _jsx("button", { type: "button", onClick: onClose, style: { ...BUTTON_RESET, padding: '3px 6px', background: 'transparent', border: 'none', color: TONE.quiet, fontSize: '11px' }, children: t('md.close') })] })] }));
}
/** One server row inside the panel. */
function ServerRow(props) {
    const { server, t } = props;
    const shown = server.tools.slice(0, MAX_TOOL_CHIPS);
    const rest = server.tools.length - shown.length;
    const status = server.loaded
        ? t(server.toolCount === 1 ? 'md.toolsOne' : 'md.toolsMany', { n: server.toolCount })
        : t('md.notLoaded');
    const origin = server.source === 'project'
        ? t('md.sourceProject')
        : server.source === 'profile'
            ? t('md.sourceProfile')
            : t('md.unmatched');
    return (_jsxs("div", { style: { display: 'flex', gap: '9px' }, children: [_jsx("span", { style: { ...portraitStyle(server, 26), marginTop: '1px' }, children: initialsOf(server.serverName) }), _jsxs("div", { style: { minWidth: 0, flex: '1 1 auto' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: '6px' }, children: [_jsx("span", { style: { fontFamily: MONO, fontSize: '12px', fontWeight: 600 }, children: server.serverName }), _jsx("span", { style: { flex: '1 1 auto' } }), _jsx("span", { style: { color: server.loaded ? TONE.mint : TONE.quiet, fontSize: '10.5px', whiteSpace: 'nowrap' }, children: status })] }), _jsxs("div", { style: { color: TONE.quiet, fontSize: '10.5px' }, children: [origin, server.target !== undefined && server.target !== ''
                                ? _jsx("span", { style: { fontFamily: MONO }, children: ` · ${server.target}` })
                                : null] }), shown.length > 0
                        ? (_jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' }, children: [shown.map((tool) => (_jsx("span", { style: {
                                        fontFamily: MONO,
                                        fontSize: '10px',
                                        padding: '1px 5px',
                                        borderRadius: '5px',
                                        background: TONE.sunk,
                                        color: TONE.muted,
                                    }, children: tool }, tool))), rest > 0
                                    ? _jsx("span", { style: { fontSize: '10px', color: TONE.quiet }, children: t('md.more', { n: rest }) })
                                    : null] }))
                        : null] })] }));
}
