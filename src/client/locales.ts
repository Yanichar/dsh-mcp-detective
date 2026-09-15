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
export const NS = 'mcp-detective'

/** English dictionary; the key set the other dictionary mirrors. */
const en = {
  'md.hint': 'MCP servers loaded into context',
  'md.title': 'MCP in context',
  'md.loadedOne': '1 server in context',
  'md.loadedMany': '{n} servers in context',
  'md.none': 'No MCP servers in context',
  'md.toolsOne': '1 tool',
  'md.toolsMany': '{n} tools',
  'md.notLoaded': 'configured, not loaded',
  'md.unmatched': 'in context, no config row found',
  'md.scopeGlobal': 'read from the global tool surface',
  'md.sourceProfile': 'profile config',
  'md.sourceProject': '.dsh/mcp.json',
  'md.error': 'MCP status unavailable',
  'md.more': '+{n} more',
  'md.refresh': 'Refresh now',
  'md.updated': 'updated {when}',
  'md.justNow': 'just now',
  'md.secondsAgo': '{n}s ago',
  'md.minutesAgo': '{n}m ago',
  'md.close': 'Close',
} as const

/** Simplified Chinese dictionary; mirrors {@link en} key for key. */
const zh: Record<keyof typeof en, string> = {
  'md.hint': '已载入上下文的 MCP 服务器',
  'md.title': '上下文中的 MCP',
  'md.loadedOne': '上下文中 1 个服务器',
  'md.loadedMany': '上下文中 {n} 个服务器',
  'md.none': '上下文中没有 MCP 服务器',
  'md.toolsOne': '1 个工具',
  'md.toolsMany': '{n} 个工具',
  'md.notLoaded': '已配置，未载入',
  'md.unmatched': '已在上下文中，但没找到配置来源',
  'md.scopeGlobal': '读取自全局工具面',
  'md.sourceProfile': 'profile 配置',
  'md.sourceProject': '.dsh/mcp.json',
  'md.error': '无法获取 MCP 状态',
  'md.more': '还有 {n} 项',
  'md.refresh': '立即刷新',
  'md.updated': '更新于 {when}',
  'md.justNow': '刚刚',
  'md.secondsAgo': '{n} 秒前',
  'md.minutesAgo': '{n} 分钟前',
  'md.close': '关闭',
}

export { en, zh }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'mcp-detective': keyof typeof en
  }
}
