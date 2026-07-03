/* ============================================
   lib/commands.js — 命令解析引擎
   内置命令 + 自定义命令 + 搜索路由
   ============================================ */

// ---------- 内置命令表 ----------
const BUILTIN_COMMANDS = Object.freeze([
  { prefix: '/google',  engineUrl: 'https://www.google.com/search?q={query}' },
  { prefix: '/bing',    engineUrl: 'https://www.bing.com/search?q={query}' },
  { prefix: '/github',  engineUrl: 'https://github.com/search?q={query}' },
  { prefix: '/juejin',  engineUrl: 'https://juejin.cn/search?query={query}' },
  { prefix: '/b',       engineUrl: 'https://www.bing.com/search?q={query}' }  // /bing 别名
]);

// ---------- 默认搜索引擎 ----------
const DEFAULT_ENGINES = {
  baidu:      'https://www.baidu.com/s?wd={query}',
  google:     'https://www.google.com/search?q={query}',
  bing:       'https://www.bing.com/search?q={query}',
  duckduckgo: 'https://duckduckgo.com/?q={query}',
  sogou:      'https://www.sogou.com/web?query={query}',
  so360:      'https://www.so.com/s?q={query}'
};

/**
 * 解析命令
 * @param {string} input - 用户输入
 * @param {Array} customCommands - 自定义命令数组
 * @param {string} defaultEngine - 默认搜索引擎 key
 * @param {string} defaultEngineUrl - 自定义默认搜索引擎 URL
 * @returns {{ searchUrl: string, matchedCommand: string|null }}
 */
export function parse(input, customCommands = [], defaultEngine = 'baidu', defaultEngineUrl = '') {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 提取第一个 token
  const firstSpace = trimmed.indexOf(' ');
  const firstToken = (firstSpace > 0) ? trimmed.substring(0, firstSpace) : trimmed;
  const rest = (firstSpace > 0) ? trimmed.substring(firstSpace + 1).trim() : '';

  // 合并命令（自定义 > 内置）
  const allCommands = buildCommandMap(customCommands);

  // 尝试匹配命令
  if (firstToken.startsWith('/')) {
    const match = allCommands.get(firstToken.toLowerCase());
    if (match) {
      const query = rest || '';
      return {
        searchUrl: match.engineUrl.replace('{query}', encodeURIComponent(query)),
        matchedCommand: firstToken
      };
    }
  }

  // 未命中命令 → 使用默认搜索引擎
  const engineUrl = DEFAULT_ENGINES[defaultEngine] || defaultEngineUrl || DEFAULT_ENGINES.baidu;
  return {
    searchUrl: engineUrl.replace('{query}', encodeURIComponent(trimmed)),
    matchedCommand: null
  };
}

/**
 * 构建命令映射表（自定义优先）
 */
function buildCommandMap(customCommands) {
  const map = new Map();

  // 先加载内置命令
  for (const cmd of BUILTIN_COMMANDS) {
    map.set(cmd.prefix.toLowerCase(), cmd);
  }

  // 自定义命令覆盖
  for (const cmd of customCommands) {
    if (!cmd.enabled && cmd.enabled !== undefined) continue;
    map.set(cmd.prefix.toLowerCase(), cmd);
    // 别名
    if (cmd.aliases && Array.isArray(cmd.aliases)) {
      for (const alias of cmd.aliases) {
        map.set(alias.toLowerCase(), cmd);
      }
    }
  }

  return map;
}

/**
 * 获取内置命令列表（只读）
 */
export function getBuiltinCommands() {
  return BUILTIN_COMMANDS.map(c => ({ ...c, builtin: true }));
}

/**
 * 获取搜索提示（前缀匹配）
 * @param {string} input
 * @param {Array} customCommands
 * @returns {string|null}
 */
export function getHint(input, customCommands = []) {
  if (!input || !input.startsWith('/')) return null;

  const allCommands = buildCommandMap(customCommands);
  const lower = input.toLowerCase().trim();

  // 精确匹配不显示提示
  if (allCommands.has(lower)) return null;

  // 前缀匹配
  for (const [prefix, cmd] of allCommands) {
    if (prefix.startsWith(lower)) {
      return `${prefix} — ${new URL(cmd.engineUrl).hostname}`;
    }
  }

  return null;
}
