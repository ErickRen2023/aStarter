/* ============================================
   service-worker.js — MV3 Service Worker
   后台定时任务 + 快捷键响应 + 安装初始化
   ============================================ */

// ---------- 安装/更新事件 ----------

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // 首次安装：写入默认设置
    await initDefaults();
  }
  // 设置每日拉取 Bing 图的 alarm
  await setupBingAlarm();
});

// ---------- Alarm 事件 ----------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'fetch-bing') {
    await fetchAndCacheBingDaily();
  }
});

// ---------- 全局快捷键 ----------

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'focus-search') {
    await notifyNewtab({ action: 'focus-search' });
  }
});

// ========== 内部函数 ==========

async function setupBingAlarm() {
  // 清除旧的 alarm
  await chrome.alarms.clear('fetch-bing');
  // 每 6 小时检查一次
  chrome.alarms.create('fetch-bing', { periodInMinutes: 360 });
}

async function fetchAndCacheBingDaily() {
  try {
    // 获取 Bing 每日图片信息
    const resp = await fetch(
      'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1'
    );
    if (!resp.ok) return;

    const data = await resp.json();
    if (!data.images || data.images.length === 0) return;

    const img = data.images[0];
    const url = 'https://www.bing.com' + img.url;

    // 下载图片
    const imgResp = await fetch(url);
    if (!imgResp.ok) return;
    const blob = await imgResp.blob();

    // 存入 IndexedDB
    const db = await openDB();
    const tx = db.transaction('images', 'readwrite');
    const store = tx.objectStore('images');
    store.put(blob, 'bing_daily');
    store.put(new Blob([img.copyright || ''], { type: 'text/plain' }), 'bing_copyright');

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });

    // 通知已打开的 newtab 页面刷新背景
    await notifyNewtab({ action: 'refresh-background' });

    console.log('[Starter SW] Bing daily image cached:', img.copyright);
  } catch (err) {
    console.warn('[Starter SW] Failed to fetch Bing daily:', err.message);
    // 静默失败，下次 alarm 重试
  }
}

async function notifyNewtab(msg) {
  try {
    // 查找 newtab 页面
    const tabs = await chrome.tabs.query({ url: 'chrome://newtab' });
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, msg);
      } catch {
        // 该 tab 未加载或无法通信
      }
    }
  } catch {
    // 静默失败
  }
}

// ---------- IndexedDB（Service Worker 侧）----------

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('starter_db', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images');
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

// ---------- 默认设置初始化 ----------

async function initDefaults() {
  const defaults = {
    background: {
      source: 'bing',
      urls: [],
      localImages: [],
      fillMode: 'cover',
      overlayOpacity: 30,
      blurEnabled: false,
      blurLevel: 5,
      carouselInterval: 0
    },
    clock: {
      showSeconds: true,
      showDate: true,
      hourFormat: '24h',
      fontSize: 48
    },
    search: {
      defaultEngine: 'baidu',
      defaultEngineUrl: 'https://www.baidu.com/s?wd={query}',
      shortcut: '/'
    },
    commands: [],
    general: {
      language: 'zh-CN'
    }
  };

  // 只在首次安装时不覆盖已有设置
  const existing = await chrome.storage.sync.get(null);
  const toSet = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in existing)) {
      toSet[key] = value;
    }
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.sync.set(toSet);
  }
}
