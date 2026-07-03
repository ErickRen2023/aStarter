/* ============================================
   newtab.js — 新标签页入口
   模块加载 + 初始化流程 + 快捷键监听
   ============================================ */

import { getSettings, onSettingsChanged } from './lib/storage.js';
import { start as clockStart, update as clockUpdate, stop as clockStop } from './lib/clock.js';
import { render as bgRender, applyEffects } from './lib/background.js';
import { init as searchInit, updateSettings as searchUpdate, focus as searchFocus } from './lib/search.js';

// ========== 初始化 ==========

document.addEventListener('DOMContentLoaded', async () => {
  // 1. 读取设置
  const settings = await getSettings();

  // 2. 并行初始化各模块
  clockStart(settings.clock, settings.general.language);
  bgRender(settings.background);
  searchInit(
    { ...settings.search, blurEnabled: settings.background.blurEnabled, blurLevel: settings.background.blurLevel },
    settings.commands
  );

  // 3. 设置按钮
  document.getElementById('settings-btn').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('settings.html'), '_blank');
    }
  });

  // 4. 监听设置变更
  onSettingsChanged(async (changes) => {
    // 重新获取完整设置（因为有默认值合并）
    const updated = await getSettings();

    // 更新各模块
    clockUpdate(updated.clock, updated.general.language);
    bgRender(updated.background);
    searchUpdate(
      { ...updated.search, blurEnabled: updated.background.blurEnabled, blurLevel: updated.background.blurLevel },
      updated.commands
    );
  });

  // 5. 页面内快捷键
  document.addEventListener('keydown', (e) => {
    handlePageShortcut(e, settings.search.shortcut);
  });

  // 6. 监听来自 Service Worker 的消息（全局快捷键 + 背景更新）
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'focus-search') {
      searchFocus();
    } else if (msg.action === 'refresh-background') {
      bgRender(settings.background);
    }
  });
});

// ========== 页面卸载清理 ==========

window.addEventListener('beforeunload', () => {
  clockStop();
});

// ========== 页面内快捷键处理 ==========

function handlePageShortcut(e, shortcut) {
  // 忽略在输入框内的按键
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
      e.target.isContentEditable) {
    return;
  }

  // 忽略包含修饰键的组合键（由 chrome.commands 处理）
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  // 单键快捷键
  if (e.key === shortcut) {
    e.preventDefault();
    searchFocus();
  }
}
