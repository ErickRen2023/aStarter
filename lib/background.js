/* ============================================
   lib/background.js — 背景图系统
   Bing 每日图 / 本地上传 / 远程 URL / 渲染效果
   ============================================ */

import { getCachedImage, cacheImage } from './storage.js';

const bgLayer = document.getElementById('background-layer');
const bgImage = document.getElementById('bg-image');
const bgOverlay = document.getElementById('bg-overlay');

let settings = {};
let carouselTimer = null;
let carouselIndex = 0;

// ========== 7 天轮换状态 ==========
let bingDayIndex = 0;   // 0=今天, 1=昨天, ..., 6=6天前
let bingDayCount = 7;   // 实际可用天数

// ========== Bing 每日图 ==========

/**
 * 从 Bing API 获取每日图片信息
 */
export async function fetchBingDaily() {
  try {
    const resp = await fetch(
      'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1'
    );
    const data = await resp.json();
    if (data.images && data.images.length > 0) {
      const img = data.images[0];
      const url = 'https://www.bing.com' + img.url;
      return {
        url,
        copyright: img.copyright || ''
      };
    }
  } catch {
    // 静默失败
  }
  return null;
}

/**
 * 下载并缓存 Bing 每日图
 */
export async function downloadAndCacheBing() {
  const info = await fetchBingDaily();
  if (!info) return null;

  try {
    const resp = await fetch(info.url);
    const blob = await resp.blob();
    await cacheImage('bing_daily', blob);
    await cacheImage('bing_copyright', new Blob([info.copyright], { type: 'text/plain' }));
    return { blob, copyright: info.copyright };
  } catch {
    return null;
  }
}

// ========== 7 天轮换：Bing 多日支持 ==========

/**
 * 根据偏移量生成 IndexedDB 缓存 key
 * @param {number} dayOffset - 0=今天, 1=昨天, ...
 */
function getBingCacheKey(dayOffset) {
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  return 'bing_' + d.toISOString().split('T')[0];
}

function getBingCopyrightKey(dayOffset) {
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  return 'bing_copyright_' + d.toISOString().split('T')[0];
}

/**
 * 获取最近 7 天 Bing 壁纸信息
 * @returns {Promise<Array<{url: string, copyright: string, date: string}>>}
 */
export async function fetchBingWeekly() {
  try {
    const resp = await fetch(
      'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=7'
    );
    const data = await resp.json();
    if (!data.images) return [];
    return data.images.map((img, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return {
        url: 'https://www.bing.com' + img.url,
        copyright: img.copyright || '',
        date: d.toISOString().split('T')[0]
      };
    });
  } catch {
    return [];
  }
}

/**
 * 下载并缓存全部 7 天 Bing 图片
 * @returns {Promise<number>} 成功缓存的图片数量
 */
export async function downloadAndCacheBingWeekly() {
  const images = await fetchBingWeekly();
  let count = 0;
  for (const img of images) {
    try {
      const resp = await fetch(img.url);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      await cacheImage('bing_' + img.date, blob);
      await cacheImage('bing_copyright_' + img.date,
        new Blob([img.copyright], { type: 'text/plain' }));
      count++;
    } catch {
      // 单张图片失败不影响其他
    }
  }
  // 向后兼容：同时写入今天的旧格式 key
  if (images.length > 0 && count > 0) {
    const todayBlob = await getCachedImage('bing_' + images[0].date);
    if (todayBlob) {
      await cacheImage('bing_daily', todayBlob);
      await cacheImage('bing_copyright',
        new Blob([images[0].copyright], { type: 'text/plain' }));
    }
  }
  await cacheImage('bing_day_count',
    new Blob([String(count)], { type: 'text/plain' }));
  bingDayCount = count || 7;
  return count;
}

/**
 * 导航到指定偏移天数的 Bing 壁纸
 * @param {number} delta - +1 更早, -1 更新
 * @param {boolean} wrap - 是否循环
 * @returns {Promise<number>} 新的 bingDayIndex
 */
export async function navigateBingDay(delta, wrap = false) {
  let newIndex;
  if (wrap) {
    newIndex = (bingDayIndex + delta + bingDayCount) % bingDayCount;
  } else {
    newIndex = Math.max(0, Math.min(bingDayCount - 1, bingDayIndex + delta));
  }
  if (newIndex === bingDayIndex) return bingDayIndex;

  bingDayIndex = newIndex;
  bgImage.classList.remove('loaded');
  await renderBing();
  applyEffects();
  return bingDayIndex;
}

/**
 * 获取当前 Bing 天数偏移
 */
export function getBingDayIndex() {
  return bingDayIndex;
}

// ========== 背景渲染 ==========

/**
 * 渲染背景
 * @param {Object} cfg - background 设置
 */
export async function render(cfg) {
  settings = { ...cfg };
  bingDayIndex = 0;   // 每次重新渲染从今天开始
  stopCarousel();

  switch (settings.source) {
    case 'bing':
      await renderBing();
      break;
    case 'local':
      await renderLocal();
      break;
    case 'url':
      await renderUrl();
      break;
    default:
      await renderBing();
  }

  applyEffects();

  // 启动轮播
  if (settings.carouselInterval > 0) {
    startCarousel();
  }
}

/**
 * 重新应用 CSS 效果（不切换来源）
 */
export function applyEffects() {
  // 遮罩
  const opacity = (settings.overlayOpacity ?? 30) / 100;
  document.documentElement.style.setProperty('--overlay-opacity', opacity);

  // 模糊
  const blurPx = settings.blurEnabled ? ((settings.blurLevel ?? 5) * 2) : 0;
  document.documentElement.style.setProperty('--bg-blur', `${blurPx}px`);

  if (blurPx > 0) {
    bgLayer.classList.add('blurred');
  } else {
    bgLayer.classList.remove('blurred');
  }
}

/**
 * 更新背景模糊（搜索框联动）
 * @param {number} px - 模糊像素值
 */
export function setBlur(px) {
  document.documentElement.style.setProperty('--bg-blur', `${px}px`);
  if (px > 0) {
    bgLayer.classList.add('blurred');
  }
}

export function clearBlur() {
  applyEffects();
}

// ========== 内部渲染函数 ==========

async function renderBing() {
  // 尝试从 IndexedDB 读取当前日期的缓存
  const key = getBingCacheKey(bingDayIndex);
  const cached = await getCachedImage(key);
  if (cached) {
    const url = URL.createObjectURL(cached);
    setImage(url);
    return;
  }

  // 回退：旧格式 bing_daily（仅今天）
  const daily = await getCachedImage('bing_daily');
  if (daily) {
    const url = URL.createObjectURL(daily);
    setImage(url);
    // 后台下载完整的 7 天缓存
    downloadAndCacheBingWeekly().catch(() => {});
    return;
  }

  // 没有缓存，实时 fetch 今天
  const info = await fetchBingDaily();
  if (info) {
    setImage(info.url);
    // 后台下载完整的 7 天缓存
    downloadAndCacheBingWeekly().catch(() => {});
  } else {
    // 降级：纯色背景
    setImage('');
  }
}

async function renderLocal() {
  const images = settings.localImages || [];
  if (images.length === 0) {
    setImage('');
    return;
  }
  carouselIndex = Math.min(carouselIndex, images.length - 1);
  setImage(images[carouselIndex]);
}

async function renderUrl() {
  const urls = settings.urls || [];
  if (urls.length === 0) {
    setImage('');
    return;
  }
  carouselIndex = Math.min(carouselIndex, urls.length - 1);
  setImage(urls[carouselIndex]);
}

function setImage(src) {
  if (!src) {
    bgImage.removeAttribute('src');
    bgImage.classList.remove('loaded');
    return;
  }
  bgImage.src = src;
  bgImage.onload = () => bgImage.classList.add('loaded');
  bgImage.onerror = () => bgImage.classList.remove('loaded');
}

function setFillMode(mode) {
  if (!bgImage) return;
  switch (mode) {
    case 'cover':
      bgImage.style.objectFit = 'cover';
      break;
    case 'contain':
      bgImage.style.objectFit = 'contain';
      break;
    case 'fill':
      bgImage.style.objectFit = 'fill';
      break;
    default:
      bgImage.style.objectFit = 'cover';
  }
}

// ========== 轮播 ==========

function startCarousel() {
  stopCarousel();
  const interval = (settings.carouselInterval || 0) * 1000;
  if (interval <= 0) return;

  carouselTimer = setInterval(() => {
    if (settings.source === 'bing') {
      // Bing 7 天轮播：循环切换
      navigateBingDay(1, true);
    } else {
      const sources = settings.source === 'local'
        ? (settings.localImages || [])
        : (settings.urls || []);
      if (sources.length <= 1) return;

      carouselIndex = (carouselIndex + 1) % sources.length;
      if (settings.source === 'local') {
        setImage(sources[carouselIndex]);
      } else {
        setImage(sources[carouselIndex]);
      }
    }
  }, interval);
}

function stopCarousel() {
  if (carouselTimer) {
    clearInterval(carouselTimer);
    carouselTimer = null;
  }
}

// ========== 公开：设置填充方式 ==========

export function updateFillMode(mode) {
  settings.fillMode = mode;
  setFillMode(mode);
}

// ========== 一键下载当前背景图 ==========

/**
 * 下载当前背景图片
 * @param {Object} cfg - background 设置
 * @returns {Promise<void>}
 */
export async function downloadCurrentImage(cfg) {
  const dateStr = new Date().toISOString().split('T')[0];

  switch (cfg.source) {
    case 'bing': {
      // 获取当前展示日期的缓存 key
      const key = getBingCacheKey(bingDayIndex);
      let blob = await getCachedImage(key);
      if (!blob) {
        // 回退：旧格式 bing_daily
        blob = await getCachedImage('bing_daily');
      }
      if (!blob) {
        // 实时下载并缓存
        const result = await downloadAndCacheBing();
        if (!result || !result.blob) {
          throw new Error('Bing image not available');
        }
        blob = result.blob;
      }

      // 获取当前日期的版权信息
      const copyrightKey = getBingCopyrightKey(bingDayIndex);
      let copyright = '';
      try {
        const copyrightBlob = await getCachedImage(copyrightKey);
        if (copyrightBlob) {
          copyright = await copyrightBlob.text();
        }
      } catch { /* ignore */ }
      if (!copyright) {
        // 回退：旧格式
        copyright = await getCopyrightText() || '';
      }

      const filename = generateFilename(copyright, dateStr, blob.type);
      triggerDownload(blob, filename);
      break;
    }

    case 'url': {
      const urls = cfg.urls || [];
      if (urls.length === 0) {
        throw new Error('No URL image available');
      }
      const idx = Math.min(carouselIndex, urls.length - 1);
      const url = urls[idx];

      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Failed to fetch URL image: ${resp.status}`);
      }
      const blob = await resp.blob();

      // 从 URL 路径提取名称
      let urlName = '';
      try {
        const pathname = new URL(url).pathname;
        const lastSeg = pathname.split('/').filter(Boolean).pop() || '';
        urlName = lastSeg.replace(/\.[^.]+$/, ''); // 去掉扩展名
      } catch { /* ignore */ }

      const filename = generateFilename(urlName, dateStr, blob.type);
      triggerDownload(blob, filename);
      break;
    }

    default:
      // local 来源：本地图片无需下载
      throw new Error('Local images are already on your device');
  }
}

// ========== 下载辅助函数 ==========

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 延迟释放 blob URL，确保浏览器下载管理器已开始读取
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function generateFilename(namePart, dateStr, mimeType) {
  // 清理文件名中的非法字符
  let clean = (namePart || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 80);

  // 根据 MIME 类型确定扩展名
  const extMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp'
  };
  const ext = extMap[mimeType] || 'jpg';

  const prefix = clean ? `bing_${clean}` : 'starter_bg';
  return `${prefix}_${dateStr}.${ext}`;
}

async function getCopyrightText() {
  try {
    const blob = await getCachedImage('bing_copyright');
    if (!blob) return '';
    return await blob.text();
  } catch {
    return '';
  }
}
