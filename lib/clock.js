/* ============================================
   lib/clock.js — 时钟模块
   requestAnimationFrame 驱动 + 冻结规则
   ============================================ */

let rafId = null;
let freezeTime = null;
let settings = {};
let lastSecond = -1;

const timeEl = document.getElementById('time');
const dateEl = document.getElementById('date');

/**
 * 启动时钟
 * @param {Object} cfg - clock 设置 { showSeconds, showDate, fontSize }
 * @param {string} lang - 语言设置
 */
export function start(cfg, lang) {
  settings = { ...cfg };
  settings.lang = lang || 'zh-CN';
  updateFontSize();
  tick();
}

/**
 * 更新设置（不重启）
 */
export function update(cfg, lang) {
  const oldFontSize = settings.fontSize;
  settings = { ...cfg };
  settings.lang = lang || settings.lang || 'zh-CN';
  if (oldFontSize !== cfg.fontSize) {
    updateFontSize();
  }
  // 强制刷新一次
  lastSecond = -1;
}

/**
 * 冻结时钟（搜索框聚焦时）
 */
export function freeze() {
  freezeTime = new Date();
}

/**
 * 解除冻结
 */
export function unfreeze() {
  freezeTime = null;
  lastSecond = -1;
}

function updateFontSize() {
  if (timeEl) {
    timeEl.style.setProperty('--clock-font-size', `${settings.fontSize || 48}px`);
  }
}

function tick() {
  rafId = requestAnimationFrame(tick);

  const now = freezeTime || new Date();
  const sec = now.getSeconds();

  // 若不显示秒钟，每分钟刷新一次
  if (!settings.showSeconds && freezeTime === null) {
    if (sec === lastSecond) return;
  }

  // 秒数没变则跳过（非冻结模式下）
  if (freezeTime === null && sec === lastSecond) return;
  lastSecond = sec;

  render(now);
}

function render(date) {
  const lang = settings.lang || 'zh-CN';

  // 时分秒：默认 24 小时制，仅在 12h 模式下显示 AM/PM
  const hour12 = settings.hourFormat === '12h';
  const timeOpts = {
    hour: '2-digit',
    minute: '2-digit',
    hour12
  };
  if (settings.showSeconds) {
    timeOpts.second = '2-digit';
  }
  let timeStr;
  try {
    timeStr = date.toLocaleTimeString(lang, timeOpts);
  } catch {
    timeStr = date.toLocaleTimeString('zh-CN', timeOpts);
  }

  // 日期
  let dateStr = '';
  if (settings.showDate !== false) {
    const dateOpts = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    };
    try {
      dateStr = date.toLocaleDateString(lang, dateOpts);
    } catch {
      dateStr = date.toLocaleDateString('zh-CN', dateOpts);
    }
  }

  if (timeEl) timeEl.textContent = timeStr;
  if (dateEl) dateEl.textContent = dateStr;
}

/**
 * 停止时钟（页面卸载时）
 */
export function stop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}
