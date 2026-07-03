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

// ========== 背景渲染 ==========

/**
 * 渲染背景
 * @param {Object} cfg - background 设置
 */
export async function render(cfg) {
  settings = { ...cfg };
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
  // 尝试从 IndexedDB 读取缓存
  const cached = await getCachedImage('bing_daily');
  if (cached) {
    const url = URL.createObjectURL(cached);
    setImage(url);
    return;
  }

  // 没有缓存，实时 fetch
  const info = await fetchBingDaily();
  if (info) {
    setImage(info.url);
    // 后台下载缓存
    downloadAndCacheBing();
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
