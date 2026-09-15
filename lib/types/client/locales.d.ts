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
export declare const NS = "mcp-detective";
/** English dictionary; the key set the other dictionary mirrors. */
declare const en: {
    readonly 'md.hint': "MCP servers loaded into context";
    readonly 'md.title': "MCP in context";
    readonly 'md.loadedOne': "1 server in context";
    readonly 'md.loadedMany': "{n} servers in context";
    readonly 'md.none': "No MCP servers in context";
    readonly 'md.toolsOne': "1 tool";
    readonly 'md.toolsMany': "{n} tools";
    readonly 'md.notLoaded': "configured, not loaded";
    readonly 'md.unmatched': "in context, no config row found";
    readonly 'md.scopeGlobal': "read from the global tool surface";
    readonly 'md.sourceProfile': "profile config";
    readonly 'md.sourceProject': ".dsh/mcp.json";
    readonly 'md.error': "MCP status unavailable";
    readonly 'md.more': "+{n} more";
    readonly 'md.refresh': "Refresh now";
    readonly 'md.updated': "updated {when}";
    readonly 'md.justNow': "just now";
    readonly 'md.secondsAgo': "{n}s ago";
    readonly 'md.minutesAgo': "{n}m ago";
    readonly 'md.close': "Close";
};
/** Simplified Chinese dictionary; mirrors {@link en} key for key. */
declare const zh: Record<keyof typeof en, string>;
export { en, zh };
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'mcp-detective': keyof typeof en;
    }
}
