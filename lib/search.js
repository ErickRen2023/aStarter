/* ============================================
   lib/search.js — 搜索框模块
   交互逻辑、毛玻璃联动、命令提示、执行搜索
   ============================================ */

import { parse, getHint } from './commands.js';
import { setBlur, clearBlur } from './background.js';
import { freeze, unfreeze } from './clock.js';

const input = document.getElementById('search-input');
const hint = document.getElementById('search-hint');

let settings = {};
let customCommands = [];

/**
 * 初始化搜索框
 * @param {Object} cfg - search + general 设置
 * @param {Array} commands - 自定义命令
 */
export function init(cfg, commands) {
  settings = { ...cfg };
  customCommands = commands || [];

  // ---------- 事件绑定 ----------

  // 输入事件
  input.addEventListener('input', onInput);

  // 键盘事件
  input.addEventListener('keydown', onKeydown);

  // 焦点事件 — 背景模糊联动 + 时钟冻结
  input.addEventListener('focus', onFocus);
  input.addEventListener('blur', onBlur);
}

/**
 * 更新设置
 */
export function updateSettings(cfg, commands) {
  settings = { ...cfg };
  customCommands = commands || [];
}

// ---------- 事件处理 ----------

function onInput() {
  const value = input.value;
  const cmdHint = getHint(value, customCommands);
  if (cmdHint) {
    hint.textContent = cmdHint;
  } else {
    hint.textContent = '';
  }
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    executeSearch();
  } else if (e.key === 'Escape') {
    input.blur();
  } else if (e.key === 'Tab' && hint.textContent) {
    // Tab 自动补全命令前缀
    e.preventDefault();
    const hintText = hint.textContent;
    const spaceIdx = hintText.indexOf(' ');
    if (spaceIdx > 0) {
      input.value = hintText.substring(0, spaceIdx) + ' ';
    }
    hint.textContent = '';
  }
}

function onFocus() {
  // 背景增强模糊
  const blurPx = settings.blurEnabled ? ((settings.blurLevel ?? 5) * 2) : 0;
  if (blurPx > 0) {
    setBlur(blurPx);
  }
  // 时钟冻结
  freeze();
}

function onBlur() {
  // 背景恢复
  clearBlur();
  // 时钟恢复
  unfreeze();
}

// ---------- 执行搜索 ----------

function executeSearch() {
  const value = input.value.trim();
  if (!value) return;

  const result = parse(
    value,
    customCommands,
    settings.defaultEngine || 'baidu',
    settings.defaultEngineUrl || ''
  );

  if (result) {
    // 跳转到搜索 URL
    window.location.href = result.searchUrl;
  }
}

// ---------- 公开方法 ----------

/**
 * 聚焦搜索框（供全局快捷键调用）
 */
export function focus() {
  input.focus();
  input.select();
}
