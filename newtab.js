/* ============================================
   newtab.js — 新标签页入口
   模块加载 + 初始化流程 + 快捷键监听
   ============================================ */

import { getSettings, onSettingsChanged } from './lib/storage.js';
import { start as clockStart, update as clockUpdate, stop as clockStop } from './lib/clock.js';
import { render as bgRender, applyEffects, downloadCurrentImage } from './lib/background.js';
import { init as searchInit, updateSettings as searchUpdate, focus as searchFocus } from './lib/search.js';
console.log('[newtab] Module loaded, importing settings...');
import { init as settingsInit, refresh as settingsRefresh } from './settings.js';
console.log('[newtab] Settings module imported successfully.');

// ========== Settings Modal State ==========

let settingsInitialized = false;

function getOverlay() { return document.getElementById('settings-modal-overlay'); }
function getModalBody() { return document.getElementById('settings-modal-body'); }

async function openSettingsModal() {
  const overlay = getOverlay();
  const body = getModalBody();
  if (!settingsInitialized) {
    await settingsInit(body);
    settingsInitialized = true;
  } else {
    await settingsRefresh();
  }
  overlay.classList.add('visible');
}

function closeSettingsModal() {
  getOverlay().classList.remove('visible');
}

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

  // 3. 设置按钮 → 弹出 Modal
  document.getElementById('settings-btn').addEventListener('click', () => {
    console.log('[newtab] Settings button clicked!');
    try {
      openSettingsModal();
    } catch (err) {
      console.error('[newtab] openSettingsModal error:', err);
    }
  });

  // 下载按钮 → 保存当前壁纸
  document.getElementById('download-btn').addEventListener('click', async () => {
    const btn = document.getElementById('download-btn');
    const icon = btn.querySelector('i');

    // loading 状态
    icon.className = 'ri-loader-4-line';
    btn.classList.add('loading');

    try {
      await downloadCurrentImage(settings.background);
      // 成功
      icon.className = 'ri-check-line';
      btn.classList.remove('loading');
      btn.classList.add('success');
    } catch (err) {
      console.error('[newtab] Download failed:', err);
      // 失败
      icon.className = 'ri-close-line';
      btn.classList.remove('loading');
      btn.classList.add('error');
    } finally {
      setTimeout(() => {
        icon.className = 'ri-download-2-line';
        btn.classList.remove('success', 'error');
      }, 2000);
    }
  });

  // Modal 关闭按钮
  document.getElementById('settings-modal-close').addEventListener('click', closeSettingsModal);

  // 点击遮罩层关闭
  getOverlay().addEventListener('click', (e) => {
    if (e.target === getOverlay()) closeSettingsModal();
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

  // 5. 全局键盘事件（快捷键 + Modal Escape）
  document.addEventListener('keydown', (e) => {
    // Escape: 优先关闭嵌套 modal（添加命令等），再关闭设置 modal
    if (e.key === 'Escape') {
      const nestedBackdrop = document.querySelector('.modal-backdrop');
      if (nestedBackdrop) return; // 嵌套 modal 自带 Escape 处理
      if (getOverlay().classList.contains('visible')) {
        closeSettingsModal();
        return;
      }
    }

    // 页面快捷键（Modal 打开时忽略）
    if (getOverlay().classList.contains('visible')) return;
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
