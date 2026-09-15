window.__ModuleLoader__.load({ id: "dsh-mcp-detective", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);

//#region src/wire.ts
/**
* Wire contract between the host half and the browser half.
*
* Imported by both sides; the constants are inlined into whichever bundle
* needs them, so this module must stay dependency-free (no node built-ins, no
* React, no cordis) — the browser bundle inlines it verbatim.
* @module dsh-mcp-detective/wire
*/
/** Same-origin endpoint the composer badges poll. */
const SERVERS_API = "/api/mcp-detective/servers";

//#endregion
//#region src/client/McpBadges.tsx
/** Poll cadence. The host caches far shorter than this, so a change lands on the next tick. */
const POLL_MS = 1e4;
/** Badges rendered before the rest collapse into a `+N` chip. */
const MAX_ICONS = 5;
/** Tool chips listed per server before `+N more`. */
const MAX_TOOL_CHIPS = 8;
/** Shell design tokens, with the same literal fallbacks the other panels use. */
const TONE = {
	canvas: "var(--dsw-alias-bg-layer-1, #161b24)",
	raised: "var(--dsw-alias-bg-layer-2, #1d2430)",
	sunk: "var(--dsw-alias-bg-layer-3, #252d3b)",
	border: "var(--dsw-alias-border-l2, rgba(196, 211, 232, 0.16))",
	borderStrong: "var(--dsw-alias-border-l3, rgba(196, 211, 232, 0.3))",
	text: "var(--dsw-alias-label-primary, #e9edf4)",
	muted: "var(--dsw-alias-label-secondary, #9ba5b5)",
	quiet: "var(--dsw-alias-label-tertiary, #707a8b)",
	mint: "var(--dsw-alias-state-success-primary, #4fc281)",
	red: "var(--dsw-alias-state-error-primary, #ef6a7d)"
};
/** Figures, server names, and config targets only — never a sentence. */
const MONO = "ui-monospace, \"SFMono-Regular\", \"Cascadia Mono\", Consolas, monospace";
/** Deterministic hue in degrees, so a server keeps its colour across reloads. */
function hueOf(name) {
	let hash = 0;
	for (let index = 0; index < name.length; index++) hash = (hash * 31 + name.charCodeAt(index)) % 360;
	return hash;
}
/** Two-letter monogram from the server name (`dsh_mcp` → `DM`, `github` → `GI`). */
function initialsOf(name) {
	const parts = name.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
	const head = parts[0];
	if (head === void 0) return "??";
	const second = parts[1];
	if (second !== void 0) return `${head[0] ?? ""}${second[0] ?? ""}`.toUpperCase();
	return head.slice(0, 2).toUpperCase();
}
/** Badge colours: saturated when loaded, grey when only configured. */
function badgeStyle(server) {
	const hue = hueOf(server.serverName);
	if (!server.loaded) return {
		background: "transparent",
		borderColor: TONE.border,
		borderStyle: "dashed",
		color: TONE.quiet
	};
	return {
		background: `hsl(${hue} 45% 26%)`,
		borderColor: `hsl(${hue} 62% 52%)`,
		borderStyle: "solid",
		color: `hsl(${hue} 85% 78%)`
	};
}
/** The portrait square used in both the row and the panel. */
function portraitStyle(server, size) {
	return {
		...badgeStyle(server),
		width: `${size}px`,
		height: `${size}px`,
		flex: "0 0 auto",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: "1px",
		borderRadius: `${Math.round(size * .32)}px`,
		fontFamily: MONO,
		fontSize: `${Math.max(8, Math.round(size * .42))}px`,
		fontWeight: 700,
		letterSpacing: "0.02em",
		lineHeight: 1,
		userSelect: "none"
	};
}
/** Reset shared by every clickable affordance in this control. */
const BUTTON_RESET = {
	appearance: "none",
	padding: 0,
	margin: 0,
	font: "inherit",
	cursor: "pointer"
};
const ROW = {
	display: "inline-flex",
	alignItems: "center",
	gap: "4px",
	position: "relative"
};
/** Relative-age label for the last successful read. */
function freshness(scannedAt, now, t) {
	const seconds = Math.max(0, Math.round((now - scannedAt) / 1e3));
	if (seconds < 5) return t("md.justNow");
	if (seconds < 60) return t("md.secondsAgo", { n: seconds });
	return t("md.minutesAgo", { n: Math.floor(seconds / 60) });
}
/**
* The composer roster control.
* @param props - slot runtime props (session identity) plus the locale `t` seat.
* @returns the badge row, or nothing before the first answer arrives.
*/
function McpBadges(props) {
	const { sessionId, t } = props;
	const [report, setReport] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const [open, setOpen] = (0, react.useState)(false);
	const [now, setNow] = (0, react.useState)(() => Date.now());
	const rootRef = (0, react.useRef)(null);
	const load = (0, react.useCallback)(async (signal) => {
		try {
			const body = await (await fetch(`${SERVERS_API}?session=${encodeURIComponent(String(sessionId))}`, {
				signal,
				headers: { accept: "application/json" }
			})).json();
			if (signal.aborted) return;
			if (!body.ok) {
				setError(body.error);
				return;
			}
			setError(null);
			setReport(body.report);
			setNow(Date.now());
		} catch (cause) {
			if (signal.aborted) return;
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}, [sessionId]);
	(0, react.useEffect)(() => {
		const controller = new AbortController();
		load(controller.signal);
		const timer = window.setInterval(() => {
			if (!document.hidden) load(controller.signal);
		}, POLL_MS);
		const onVisibility = () => {
			if (!document.hidden) load(controller.signal);
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			document.removeEventListener("visibilitychange", onVisibility);
			window.clearInterval(timer);
			controller.abort();
		};
	}, [load]);
	(0, react.useEffect)(() => {
		if (!open) return void 0;
		const onPointerDown = (event) => {
			const root = rootRef.current;
			if (root !== null && !root.contains(event.target)) setOpen(false);
		};
		const onKeyDown = (event) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);
	const refresh = (0, react.useCallback)(() => {
		load(new AbortController().signal);
	}, [load]);
	if (report === null) {
		if (error === null) return null;
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: {
				...ROW,
				color: TONE.red,
				fontSize: "11px"
			},
			title: error,
			children: t("md.error")
		});
	}
	const servers = report.servers;
	const visible = servers.slice(0, MAX_ICONS);
	const hidden = servers.length - visible.length;
	servers.filter((server) => server.loaded).length;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		ref: rootRef,
		style: ROW,
		children: [
			servers.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				title: t("md.none"),
				style: {
					width: "10px",
					height: "10px",
					borderRadius: "50%",
					border: `1px dashed ${TONE.borderStrong}`,
					opacity: .6
				}
			}) : null,
			visible.map((server) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: () => setOpen((value) => !value),
				title: `${server.serverName} — ${server.loaded ? t(server.toolCount === 1 ? "md.toolsOne" : "md.toolsMany", { n: server.toolCount }) : t("md.notLoaded")}`,
				"aria-label": server.serverName,
				"aria-expanded": open,
				style: {
					...BUTTON_RESET,
					...portraitStyle(server, 22),
					position: "relative"
				},
				children: [initialsOf(server.serverName), server.loaded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
					position: "absolute",
					right: "-1px",
					bottom: "-1px",
					width: "6px",
					height: "6px",
					borderRadius: "50%",
					background: TONE.mint,
					boxShadow: `0 0 0 2px ${TONE.canvas}`
				} }) : null]
			}, server.serverName)),
			hidden > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => setOpen((value) => !value),
				title: t("md.loadedMany", { n: servers.length }),
				style: {
					...BUTTON_RESET,
					...portraitStyle({
						serverName: "",
						toolCount: 0,
						loaded: false,
						configured: false,
						tools: []
					}, 22),
					fontFamily: MONO
				},
				children: `+${hidden}`
			}) : null,
			open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Roster, {
				report,
				now,
				onRefresh: refresh,
				onClose: () => setOpen(false),
				t
			}) : null
		]
	});
}
/** The expanded panel: every server, what it contributes, and where it came from. */
function Roster(props) {
	const { report, now, onRefresh, onClose, t } = props;
	const loadedCount = report.servers.filter((server) => server.loaded).length;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			position: "absolute",
			bottom: "calc(100% + 8px)",
			right: 0,
			zIndex: 40,
			width: "300px",
			maxHeight: "60vh",
			overflowY: "auto",
			padding: "10px 12px 12px",
			borderRadius: "12px",
			border: `1px solid ${TONE.borderStrong}`,
			background: TONE.canvas,
			boxShadow: "0 18px 40px rgba(0, 0, 0, 0.45)",
			color: TONE.text,
			fontSize: "12px",
			lineHeight: 1.45,
			textAlign: "left"
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "baseline",
					gap: "8px"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: { fontWeight: 600 },
						children: t("md.title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: "1 1 auto" } }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: TONE.quiet,
							fontSize: "11px"
						},
						children: t("md.updated", { when: freshness(report.scannedAt, now, t) })
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					color: TONE.muted,
					fontSize: "11px",
					marginTop: "2px"
				},
				children: [loadedCount === 1 ? t("md.loadedOne") : t("md.loadedMany", { n: loadedCount }), report.scope === "global" ? ` · ${t("md.scopeGlobal")}` : ""]
			}),
			report.servers.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					color: TONE.quiet,
					marginTop: "8px"
				},
				children: t("md.none")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: "9px",
					marginTop: "10px"
				},
				children: report.servers.map((server) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ServerRow, {
					server,
					t
				}, server.serverName))
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "8px",
					marginTop: "10px"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: onRefresh,
						style: {
							...BUTTON_RESET,
							padding: "3px 9px",
							borderRadius: "7px",
							border: `1px solid ${TONE.border}`,
							background: TONE.raised,
							color: TONE.muted,
							fontSize: "11px"
						},
						children: t("md.refresh")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: "1 1 auto" } }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: onClose,
						style: {
							...BUTTON_RESET,
							padding: "3px 6px",
							background: "transparent",
							border: "none",
							color: TONE.quiet,
							fontSize: "11px"
						},
						children: t("md.close")
					})
				]
			})
		]
	});
}
/** One server row inside the panel. */
function ServerRow(props) {
	const { server, t } = props;
	const shown = server.tools.slice(0, MAX_TOOL_CHIPS);
	const rest = server.tools.length - shown.length;
	const status = server.loaded ? t(server.toolCount === 1 ? "md.toolsOne" : "md.toolsMany", { n: server.toolCount }) : t("md.notLoaded");
	const origin = server.source === "project" ? t("md.sourceProject") : server.source === "profile" ? t("md.sourceProfile") : t("md.unmatched");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			display: "flex",
			gap: "9px"
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: {
				...portraitStyle(server, 26),
				marginTop: "1px"
			},
			children: initialsOf(server.serverName)
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				minWidth: 0,
				flex: "1 1 auto"
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "baseline",
						gap: "6px"
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontFamily: MONO,
								fontSize: "12px",
								fontWeight: 600
							},
							children: server.serverName
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: "1 1 auto" } }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								color: server.loaded ? TONE.mint : TONE.quiet,
								fontSize: "10.5px",
								whiteSpace: "nowrap"
							},
							children: status
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						color: TONE.quiet,
						fontSize: "10.5px"
					},
					children: [origin, server.target !== void 0 && server.target !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: { fontFamily: MONO },
						children: ` · ${server.target}`
					}) : null]
				}),
				shown.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexWrap: "wrap",
						gap: "3px",
						marginTop: "4px"
					},
					children: [shown.map((tool) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontFamily: MONO,
							fontSize: "10px",
							padding: "1px 5px",
							borderRadius: "5px",
							background: TONE.sunk,
							color: TONE.muted
						},
						children: tool
					}, tool)), rest > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: "10px",
							color: TONE.quiet
						},
						children: t("md.more", { n: rest })
					}) : null]
				}) : null
			]
		})]
	});
}

//#endregion
//#region src/client/locales.ts
/**
* MCP Detective locale dictionaries.
*
* Both shipped locales must be registered together: the typed `register` form
* demands a complete `Record<BuiltInLocaleId, …>` and the locale runtime
* enforces bilingual balance at registration time. Product and protocol nouns
* (`MCP`, `stdio`, `mcp.json`, server names) stay untranslated on purpose —
* they read the same to a developer in either language and only drift once
* localized.
*
* @module dsh-mcp-detective/client/locales
*/
/** Locale namespace owned by this plugin. */
const NS = "mcp-detective";
/** English dictionary; the key set the other dictionary mirrors. */
const en = {
	"md.hint": "MCP servers loaded into context",
	"md.title": "MCP in context",
	"md.loadedOne": "1 server in context",
	"md.loadedMany": "{n} servers in context",
	"md.none": "No MCP servers in context",
	"md.toolsOne": "1 tool",
	"md.toolsMany": "{n} tools",
	"md.notLoaded": "configured, not loaded",
	"md.unmatched": "in context, no config row found",
	"md.scopeGlobal": "read from the global tool surface",
	"md.sourceProfile": "profile config",
	"md.sourceProject": ".dsh/mcp.json",
	"md.error": "MCP status unavailable",
	"md.more": "+{n} more",
	"md.refresh": "Refresh now",
	"md.updated": "updated {when}",
	"md.justNow": "just now",
	"md.secondsAgo": "{n}s ago",
	"md.minutesAgo": "{n}m ago",
	"md.close": "Close"
};
/** Simplified Chinese dictionary; mirrors {@link en} key for key. */
const zh = {
	"md.hint": "已载入上下文的 MCP 服务器",
	"md.title": "上下文中的 MCP",
	"md.loadedOne": "上下文中 1 个服务器",
	"md.loadedMany": "上下文中 {n} 个服务器",
	"md.none": "上下文中没有 MCP 服务器",
	"md.toolsOne": "1 个工具",
	"md.toolsMany": "{n} 个工具",
	"md.notLoaded": "已配置，未载入",
	"md.unmatched": "已在上下文中，但没找到配置来源",
	"md.scopeGlobal": "读取自全局工具面",
	"md.sourceProfile": "profile 配置",
	"md.sourceProject": ".dsh/mcp.json",
	"md.error": "无法获取 MCP 状态",
	"md.more": "还有 {n} 项",
	"md.refresh": "立即刷新",
	"md.updated": "更新于 {when}",
	"md.justNow": "刚刚",
	"md.secondsAgo": "{n} 秒前",
	"md.minutesAgo": "{n} 分钟前",
	"md.close": "关闭"
};

//#endregion
//#region src/client/index.ts
/** Required services. */
const inject = ["slots", "locale"];
/**
* Client plugin body: register the dictionaries and seat the roster once the
* composer bar is on the ledger.
* @param ctx - browser plugin context.
*/
function apply(ctx) {
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "mcp-detective: dictionaries");
	ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
		name: "conversation.input.right",
		id: "mcp-detective",
		order: 10,
		locale: NS
	}, McpBadges));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; } });
//# sourceMappingURL=client.js.map