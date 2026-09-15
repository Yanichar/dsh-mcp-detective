# dsh-mcp-detective

DSH plugin: **which MCP servers are actually loaded into the model context**, as icons in the
composer bar.

Icons sit in the composer tool row, left of the Context Doctor control and left of the model name:

```
[ MCP icons ][ Context Doctor ][ model name ][ context meter ][ Stop ]
```

## What it shows

| State | Meaning |
| --- | --- |
| Coloured badge, green dot | The server contributes ≥1 tool to this session's model-facing tool surface — it is really in context |
| Dashed grey badge | The server is configured but contributes nothing (initial connect failed, it lists no tools, or the project bridge skipped it as a duplicate of an upper-layer server) |
| Small dashed circle | No MCP servers in context |

Click a badge to open the roster: per server — status, tool count, config origin
(profile config vs `.dsh/mcp.json`), the command/URL it was configured with, and the tool names.
Servers present in context with no config row anywhere are labelled as such instead of being
attributed to a config that does not name them.

## How the fact is determined

Two independent sources are merged, because neither alone answers it:

1. **The tool surface.** `ctx.tools.schemas(agent)` is exactly the schema list that goes to the
   model, and every MCP tool arrives as `mcp__<serverName>__<rawName>`. A server is loaded iff it
   contributed at least one tool here. The read is **agent-scoped** — a bare `schemas()` call sees
   only the global layer and silently hides every server a preset or `dsh-project-mcp-bridge`
   registered into the agent layer.
2. **Config rows** — the booted profile's `cordis.yml` / `cordis.patch.yml` plus the home patch and
   the session's `<cwd>/.dsh/mcp.json`.

`dsh-mcp-client` publishes no enumerable server registry (its live-name set is a module-private
`WeakMap`), so server identity is recovered from the public tool name: the last `__` separates the
namespace from the raw tool name. The `mcp__<serverName>__` prefix survives the harness's lossy name
normalization, which truncates from the end (the prefix is at most 39 of the 51-char budget), so
attribution stays correct even when a raw tool name is replaced by a hash — only the displayed raw
name degrades in that case.

## Freshness

Fetch on mount, then **every 10 seconds**, plus an immediate refresh when the tab becomes visible
again. Hidden tabs stop polling — their answer is stale by definition and the visibility handler
catches them up. The host answer is memoized for 2 seconds, well under the poll interval, so a server
that finishes connecting or an `mcp.json` edit shows up on the next tick.

## Install (local testing)

```sh
dsh plugin --profile web add "link:/path/to/dsh-mcp-detective"
```

`dsh plugin` forwards to pnpm in the profile directory and appends the package to
`dsh.profile.bundles`; the plugin's own `cordis.patch.yml` then inserts the host row. Restart
`dsh web` — a new bundle row is a boot-time fact, so live patch reload does not pick it up.

## Build

```sh
pnpm install
pnpm build      # tsc -> lib/types, tsdown -> lib/index.js + lib/client.js
```

The browser half **must** be a built bundle: DSH serves `lib/client.js` as-is. It is emitted as the
closure factory the loader expects (`window.__ModuleLoader__.load({ id, factory })`) and resolves
only `react` / `react/jsx-runtime` from the platform module table. Any other `@deepseek-ai/*` value
import fails the build deliberately — cross-plugin value imports are forbidden.

## Config

| Option | Default | Meaning |
| --- | --- | --- |
| `cacheTtlMs` | `2000` | How long one host answer is reused. Keep it well under the 10s poll |
| `defaultCwd` | — | Directory for `.dsh/mcp.json` when no session resolves |

## Known limits

- **Polling, not push.** 10s staleness by design; no host→browser event channel is used.
- **Server-name recovery is heuristic.** A raw MCP tool name containing `__` would split the wrong
  way; config rows provide the authoritative names and are merged in, but a server with no config row
  and a `__`-bearing tool name can be mis-attributed.
- **Profile config is read as text.** The YAML scanner recognises flat `- name: …dsh-mcp-client` rows
  with scalar keys; anything it does not understand yields fewer rows, never a throw.
- **Headless profiles** have no `webServer`, so the plugin contributes nothing there.
