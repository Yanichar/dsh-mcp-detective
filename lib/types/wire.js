/**
 * Wire contract between the host half and the browser half.
 *
 * Imported by both sides; the constants are inlined into whichever bundle
 * needs them, so this module must stay dependency-free (no node built-ins, no
 * React, no cordis) — the browser bundle inlines it verbatim.
 * @module dsh-mcp-detective/wire
 */
/** Same-origin endpoint the composer badges poll. */
export const SERVERS_API = '/api/mcp-detective/servers';
