/* ============================================
   lib/storage.js — 存储层抽象
   chrome.storage.sync + IndexedDB 封装
   ============================================ */

// ---------- 默认设置 ----------
const DEFAULTS = Object.freeze({
  background: {
    source: 'bing',           // 'bing' | 'local' | 'url'
    urls: [],                 // 远程 URL 列表
    localImages: [],          // 本地图片 dataURL 列表
    fillMode: 'cover',        // 'cover' | 'contain' | 'fill'
    overlayOpacity: 30,       // 0-60
    blurEnabled: false,
    blurLevel: 5,             // 1-10
    carouselInterval: 0       // 秒，0=关闭
  },
  clock: {
    showSeconds: true,
    showDate: true,
    hourFormat: '24h',         // '24h' | '12h'
    fontSize: 48              // px，映射为 CSS rem
  },
  search: {
    defaultEngine: 'baidu',
    defaultEngineUrl: 'https://www.baidu.com/s?wd={query}',
    shortcut: '/'
  },
  commands: [],               // 自定义命令数组
  general: {
    language: 'zh-CN'
  }
});

// ---------- IndexedDB 封装 ----------
const DB_NAME = 'starter_db';
const DB_VERSION = 1;
const STORE_NAME = 'images';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function withStore(mode) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, mode);
  return tx.objectStore(STORE_NAME);
}

// ---------- 公开 API ----------

/**
 * 获取全部设置，合并默认值
 * @returns {Promise<Object>}
 */
export async function getSettings() {
  try {
    const stored = await chrome.storage.sync.get(null);
    return deepMerge(DEFAULTS, stored);
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/**
 * 差分写入设置
 * @param {Object} partial
 */
export async function setSettings(partial) {
  await chrome.storage.sync.set(partial);
}

/**
 * 监听设置变更
 * @param {Function} callback
 */
export function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
      const flat = {};
      for (const [key, { newValue }] of Object.entries(changes)) {
        flat[key] = newValue;
      }
      callback(flat);
    }
  });
}

// ---------- 图片缓存 (IndexedDB) ----------

export async function cacheImage(key, blob) {
  const store = await withStore('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(blob, key);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getCachedImage(key) {
  try {
    const store = await withStore('readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch {
    return null;
  }
}

/**
 * 获取所有缓存的图片 key 列表
 */
export async function getAllCachedImageKeys() {
  try {
    const store = await withStore('readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch {
    return [];
  }
}

/**
 * 删除指定 key 的缓存图片
 */
export async function removeCachedImage(key) {
  const store = await withStore('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * 清空所有缓存的图片（IndexedDB images 存储）
 */
export async function clearAllCachedImages() {
  const store = await withStore('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

// ---------- 配置导入/导出 ----------

export async function exportConfig() {
  const settings = await getSettings();
  // 移除本地图片 dataURL（体积过大）
  const clean = structuredClone(settings);
  clean.background.localImages = [];
  return JSON.stringify(clean, null, 2);
}

export async function importConfig(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('JSON 格式无效');
  }

  // Schema 校验：必须包含四大分区
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('配置格式无效');
  }

  // 合并导入：只写入有效的 key
  const valid = {};
  for (const section of ['background', 'clock', 'search', 'commands', 'general']) {
    if (parsed[section] !== undefined) {
      valid[section] = parsed[section];
    }
  }

  // commands 额外校验
  if (valid.commands && !Array.isArray(valid.commands)) {
    throw new Error('commands 必须是数组');
  }

  await chrome.storage.sync.set(valid);
  return valid;
}

/**
 * 重置所有设置为默认值
 */
export async function resetSettings() {
  // 清空 sync 然后写回默认值
  await chrome.storage.sync.clear();
  await chrome.storage.sync.set(structuredClone(DEFAULTS));
}

// ---------- 工具函数 ----------

function deepMerge(defaults, overrides) {
  const result = {};
  for (const key of Object.keys(defaults)) {
    const def = defaults[key];
    const ovr = overrides[key];
    if (ovr === undefined) {
      result[key] = structuredClone(def);
    } else if (def !== null && typeof def === 'object' && !Array.isArray(def) &&
               ovr !== null && typeof ovr === 'object' && !Array.isArray(ovr)) {
      result[key] = deepMerge(def, ovr);
    } else {
      result[key] = structuredClone(ovr);
    }
  }
  // 保留 overrides 中有但 defaults 中没有的 key（向后兼容）
  for (const key of Object.keys(overrides)) {
    if (!(key in defaults)) {
      result[key] = structuredClone(overrides[key]);
    }
  }
  return result;
}

function structuredClone(obj) {
  // 浏览器原生支持，但为了兼容性也提供 JSON 回退
  if (typeof structuredClone === 'function') {
    try { return structuredClone(obj); } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(obj));
}
