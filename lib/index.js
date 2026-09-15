import { readFile } from "node:fs/promises";
import { join } from "node:path";

//#region lib/types/scan.js
const MCP_PREFIX = "mcp__";
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
/**
* Split a public MCP tool name back into its server namespace and raw name.
* @param publicName - the registered tool name.
* @returns the two parts, or `undefined` when this is not an MCP tool name.
*/
function parseMcpToolName(publicName) {
	if (!publicName.startsWith(MCP_PREFIX)) return void 0;
	const body = publicName.slice(5);
	const at = body.lastIndexOf("__");
	if (at <= 0) return void 0;
	return {
		serverName: body.slice(0, at),
		rawName: body.slice(at + 2)
	};
}
/** Group the tool surface by server namespace, keeping raw tool names. */
function collectLoaded(schemas) {
	const byServer = /* @__PURE__ */ new Map();
	for (const schema of schemas) {
		if (typeof schema?.name !== "string") continue;
		const parsed = parseMcpToolName(schema.name);
		if (parsed === void 0) continue;
		const list = byServer.get(parsed.serverName);
		if (list === void 0) byServer.set(parsed.serverName, [parsed.rawName]);
		else list.push(parsed.rawName);
	}
	return byServer;
}
/** Strip one layer of matching quotes and trailing YAML comment noise. */
function unquote(value) {
	const trimmed = value.trim();
	const withoutComment = trimmed.startsWith("'") || trimmed.startsWith("\"") ? trimmed : (trimmed.split(" #")[0] ?? trimmed).trim();
	const first = withoutComment[0];
	if ((first === "'" || first === "\"") && withoutComment.endsWith(first) && withoutComment.length > 1) return withoutComment.slice(1, -1);
	return withoutComment;
}
/** Whether a YAML `name:` value denotes the official MCP client plugin row. */
function isMcpClientRow(name$1) {
	return name$1 === "mcp-client" || name$1.endsWith("/dsh-mcp-client") || name$1 === "dsh-mcp-client";
}
/**
* Recover `serverName` rows from a cordis YAML file without a YAML parser.
*
* The dependency is deliberately avoided: a host-half dependency that the
* profile cannot resolve is a boot failure, and the shapes we read are a flat
* list of `- name: <plugin>` rows with scalar keys nested under `config:`.
* Anything the scanner does not understand yields fewer rows, never a throw.
* @param text - raw YAML file contents.
* @param source - config origin stamped on every recovered row.
* @returns one row per MCP client entry that declared a valid `serverName`.
*/
function scanYamlServerRows(text, source) {
	const rows = [];
	let current;
	const flush = () => {
		const name$1 = current?.["serverName"];
		if (name$1 !== void 0 && SERVER_NAME_PATTERN.test(name$1)) {
			const transport = current?.["transport"];
			const cmd = current?.["command"];
			const url = current?.["url"];
			const target = transport === "streamable-http" ? url : cmd ?? url;
			rows.push({
				serverName: name$1,
				source,
				...transport !== void 0 ? { transport } : {},
				...target !== void 0 ? { target } : {}
			});
		}
		current = void 0;
	};
	for (const line of text.split(/\r?\n/)) {
		const item = /^(\s*)-\s+(.*)$/.exec(line);
		if (item !== null) {
			flush();
			const inlineName = /(?:^|\s)name:\s*(.+)$/.exec(item[2] ?? "");
			const named = inlineName === null ? void 0 : unquote(inlineName[1] ?? "");
			current = named !== void 0 && isMcpClientRow(named) ? {} : void 0;
			continue;
		}
		if (current === void 0) continue;
		const kv = /^\s*([A-Za-z][A-Za-z0-9_]*):\s*(.+)$/.exec(line);
		if (kv === null) continue;
		const key = kv[1];
		if (key === void 0) continue;
		current[key] = unquote(kv[2] ?? "");
	}
	flush();
	return rows;
}
/** Read a file, mapping every failure (including ENOENT) to `undefined`. */
async function readText(path) {
	try {
		return await readFile(path, "utf8");
	} catch {
		return;
	}
}
/**
* Server rows declared by the project's own `.dsh/mcp.json` — the file
* `dsh-project-mcp-bridge` loads per session.
* @param cwd - session working directory.
* @returns configured rows; empty when the file is absent or malformed.
*/
async function readProjectConfig(cwd) {
	if (cwd === void 0 || cwd === "") return [];
	const text = await readText(join(cwd, ".dsh", "mcp.json"));
	if (text === void 0) return [];
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return [];
	}
	const servers = parsed?.mcpServers;
	if (servers === null || typeof servers !== "object" || Array.isArray(servers)) return [];
	const rows = [];
	for (const [serverName, raw] of Object.entries(servers)) {
		if (!SERVER_NAME_PATTERN.test(serverName)) continue;
		const entry = raw ?? {};
		const command = typeof entry["command"] === "string" ? entry["command"] : void 0;
		const url = typeof entry["url"] === "string" ? entry["url"] : void 0;
		const transport = command !== void 0 ? "stdio" : url !== void 0 ? "streamable-http" : void 0;
		const target = command ?? url;
		rows.push({
			serverName,
			source: "project",
			...transport !== void 0 ? { transport } : {},
			...target !== void 0 ? { target } : {}
		});
	}
	return rows;
}
/**
* Which profile the current process booted, from `--profile <name>` or one of
* the documented aliases.
* @param argv - `process.argv`.
* @returns the profile name, or `undefined` when it cannot be told.
*/
function profileFromArgv(argv) {
	const at = argv.indexOf("--profile");
	const named = at >= 0 ? argv[at + 1] : void 0;
	if (named !== void 0 && named !== "" && !named.startsWith("-")) return named;
	for (const alias of [
		"web",
		"headless",
		"sdk",
		"sdk-minimal",
		"acp"
	]) if (argv.includes(alias)) return alias;
}
/**
* Server rows declared by cordis config: the booted profile's `cordis.yml` and
* `cordis.patch.yml`, plus the home-level patch.
* @param dshHome - DSH home directory.
* @param profile - booted profile name; when absent the profile files are skipped.
* @returns configured rows from every readable source.
*/
async function readProfileConfig(dshHome, profile) {
	const paths = [];
	if (profile !== void 0) {
		paths.push(join(dshHome, "profiles", profile, "cordis.yml"));
		paths.push(join(dshHome, "profiles", profile, "cordis.patch.yml"));
	}
	paths.push(join(dshHome, "cordis.patch.yml"));
	const texts = await Promise.all(paths.map((path) => readText(path)));
	const rows = [];
	for (const text of texts) if (text !== void 0) rows.push(...scanYamlServerRows(text, "profile"));
	return rows;
}
/** Merge the two sources into the report the panel renders. */
function buildReport(input) {
	const { loaded, configured, scope } = input;
	const byName = /* @__PURE__ */ new Map();
	for (const row of configured) {
		const existing = byName.get(row.serverName);
		if (existing === void 0 || existing.source === "profile" && row.source === "project") byName.set(row.serverName, row);
	}
	const names = new Set([...loaded.keys(), ...byName.keys()]);
	const servers = [];
	for (const name$1 of names) {
		const tools = loaded.get(name$1) ?? [];
		const row = byName.get(name$1);
		servers.push({
			serverName: name$1,
			toolCount: tools.length,
			loaded: tools.length > 0,
			configured: row !== void 0,
			tools: [...tools].sort(),
			...row?.source !== void 0 ? { source: row.source } : {},
			...row?.transport !== void 0 ? { transport: row.transport } : {},
			...row?.target !== void 0 ? { target: row.target } : {}
		});
	}
	servers.sort((left, right) => {
		if (left.loaded !== right.loaded) return left.loaded ? -1 : 1;
		return left.serverName.localeCompare(right.serverName);
	});
	return {
		servers,
		scope,
		scannedAt: Date.now(),
		unmatched: [...loaded.keys()].filter((name$1) => !byName.has(name$1)).sort(),
		...input.sessionId !== void 0 ? { sessionId: input.sessionId } : {},
		...input.cwd !== void 0 ? { cwd: input.cwd } : {}
	};
}
/**
* Run one full scan: read the tool surface, read both config sources, merge.
* @param input - surface, scope, and the paths config is read from.
* @returns the report served to the browser half.
*/
async function scan(input) {
	const { tools, agent } = input;
	const dshHome = input.dshHome ?? process.env["DSH_HOME"] ?? "";
	const profile = input.profile ?? profileFromArgv(process.argv);
	const loaded = collectLoaded(agent === void 0 ? tools.schemas() : tools.schemas(agent));
	const [project, profileRows] = await Promise.all([readProjectConfig(input.cwd), dshHome === "" ? Promise.resolve([]) : readProfileConfig(dshHome, profile)]);
	return buildReport({
		loaded,
		configured: [...profileRows, ...project],
		scope: agent === void 0 ? "global" : "agent",
		...input.cwd !== void 0 ? { cwd: input.cwd } : {}
	});
}

//#endregion
//#region lib/types/wire.js
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
//#region lib/types/routes.js
/** Write one JSON response. */
function json(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(body));
}
/** Read one query parameter (URL-decoded, first occurrence wins). */
function parseQueryParam(url, key) {
	const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
	for (const part of query.split("&")) {
		if (!part.startsWith(`${key}=`)) continue;
		try {
			return decodeURIComponent(part.slice(key.length + 1));
		} catch {
			return;
		}
	}
}
/**
* Build the roster route.
* @param config - surface, registries, and cache window.
* @returns the single route to register on `ctx.webServer`.
*/
function makeRoutes(config) {
	const cacheTtlMs = config.cacheTtlMs ?? 2e3;
	const cache = /* @__PURE__ */ new Map();
	/** Bound so a long-lived browser tab cannot grow the map without limit. */
	const MAX_CACHE_ENTRIES = 16;
	const cached = (key, run) => {
		const hit = cache.get(key);
		if (hit !== void 0 && Date.now() - hit.at < cacheTtlMs) return hit.promise;
		if (cache.size >= MAX_CACHE_ENTRIES) {
			const oldest = cache.keys().next().value;
			if (oldest !== void 0) cache.delete(oldest);
		}
		const promise = run().catch((error) => {
			cache.delete(key);
			throw error;
		});
		cache.set(key, {
			at: Date.now(),
			promise
		});
		return promise;
	};
	return [{
		kind: "exact",
		path: SERVERS_API,
		handler: (req, res) => {
			if (req.method !== "GET") {
				json(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				return;
			}
			const url = req.url ?? "";
			const sessionId = parseQueryParam(url, "session");
			const explicitCwd = parseQueryParam(url, "cwd");
			const sessionCwd = (sessionId === void 0 || sessionId === "" ? void 0 : config.sessions?.get(sessionId))?.header?.cwd;
			const cwd = explicitCwd ?? (sessionCwd !== void 0 && sessionCwd !== "" ? sessionCwd : void 0) ?? config.defaultCwd;
			const agent = sessionId === void 0 || sessionId === "" ? void 0 : config.agents?.get(sessionId);
			cached(`${sessionId ?? ""}|${agent !== void 0 ? "agent" : "global"}|${cwd ?? ""}`, () => scan({
				tools: config.tools,
				...agent !== void 0 ? { agent } : {},
				...cwd !== void 0 ? { cwd } : {},
				...config.dshHome !== void 0 ? { dshHome: config.dshHome } : {},
				...config.profile !== void 0 ? { profile: config.profile } : {}
			})).then((report) => {
				json(res, 200, {
					ok: true,
					report: sessionId !== void 0 && sessionId !== "" ? {
						...report,
						sessionId
					} : report
				});
			}, (error) => {
				json(res, 500, {
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				});
			});
		}
	}];
}

//#endregion
//#region lib/types/index.js
/** Cordis plugin name used by loader diagnostics. */
const name = "mcp-detective";
/** Services required by this plugin. */
const inject = ["tools"];
/**
* Plugin body.
* @param ctx - plugin context carrying the tool registry.
* @param config - cache window and fallback directory.
*/
function apply(ctx, config = {}) {
	const agents = ctx.get("agents");
	const sessions = ctx.get("sessions");
	const routes = makeRoutes({
		tools: ctx.tools,
		...agents !== void 0 ? { agents } : {},
		...sessions !== void 0 ? { sessions } : {},
		...config.defaultCwd !== void 0 ? { defaultCwd: config.defaultCwd } : {},
		...config.cacheTtlMs !== void 0 ? { cacheTtlMs: config.cacheTtlMs } : {}
	});
	ctx.inject(["webServer"], (httpCtx) => {
		httpCtx.effect(() => {
			const disposers = routes.map((route) => httpCtx.webServer.register(route));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "mcp-detective: routes");
	});
}

//#endregion
export { apply, inject, name };