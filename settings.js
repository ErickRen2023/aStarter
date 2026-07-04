/* ============================================
   settings.js — 设置页面逻辑
   表单绑定 + 自动保存 + 导入导出 + 命令管理
   ============================================ */

import { getSettings, setSettings, exportConfig, importConfig, resetSettings,
         cacheImage, getCachedImage, getAllCachedImageKeys, removeCachedImage } from './lib/storage.js';

// ========== 状态 ==========

let currentSettings = {};
let saveTimer = null;
let scope = document;
const SAVE_DEBOUNCE = 500;

// ========== DOM 元素缓存 ==========

function $(selector, s) {
  return (s || scope).querySelector(selector);
}

// ========== 初始化 ==========

export async function init(rootElement) {
  scope = rootElement || document;
  currentSettings = await getSettings();
  populateForm();
  bindEvents();
  renderCommandsList();
  updateConditionalVisibility();
}

export async function refresh() {
  currentSettings = await getSettings();
  populateForm();
  renderCommandsList();
  updateConditionalVisibility();
}

// ========== 表单填充 ==========

function populateForm() {
  const bg = currentSettings.background;
  const cl = currentSettings.clock;
  const sr = currentSettings.search;
  const gn = currentSettings.general;

  // Background
  $('#bg-source').value = bg.source;
  $('#bg-urls').value = (bg.urls || []).join(', ');
  $('#bg-fill').value = bg.fillMode;
  $('#bg-overlay').value = bg.overlayOpacity;
  $('#overlay-value').textContent = bg.overlayOpacity;
  $('#bg-blur-enabled').checked = bg.blurEnabled;
  $('#bg-blur-level').value = bg.blurLevel;
  $('#blur-value').textContent = bg.blurLevel;
  $('#bg-carousel').value = bg.carouselInterval;

  // Clock
  $('#clock-seconds').checked = cl.showSeconds;
  $('#clock-date').checked = cl.showDate;
  $('#clock-hourformat').value = cl.hourFormat || '24h';
  $('#clock-fontsize').value = cl.fontSize;

  // Search
  const engine = sr.defaultEngine;
  if (['baidu', 'google', 'bing', 'duckduckgo', 'sogou', 'so360'].includes(engine)) {
    $('#search-engine').value = engine;
  } else {
    $('#search-engine').value = 'custom';
  }
  $('#search-engine-url').value = sr.defaultEngineUrl || '';
  $('#search-shortcut').value = sr.shortcut || '';

  // General
  $('#general-lang').value = gn.language;

  // 渲染本地图片预览
  renderLocalPreview();
}

// ========== 事件绑定 ==========

function bindEvents() {
  // ---- Background ----
  bindChange('#bg-source', 'background', 'source');
  bindChange('#bg-fill', 'background', 'fillMode');
  bindRange('#bg-overlay', 'background', 'overlayOpacity', '#overlay-value');
  bindCheckbox('#bg-blur-enabled', 'background', 'blurEnabled');
  bindRange('#bg-blur-level', 'background', 'blurLevel', '#blur-value');
  bindChangeNum('#bg-carousel', 'background', 'carouselInterval');
  bindDebounced('#bg-urls', (val) => {
    currentSettings.background.urls = val.split(',').map(s => s.trim()).filter(Boolean);
    scheduleSave();
  });

  // 条件显示
  $('#bg-source').addEventListener('change', updateConditionalVisibility);
  $('#bg-blur-enabled').addEventListener('change', updateConditionalVisibility);
  $('#search-engine').addEventListener('change', updateConditionalVisibility);

  // 本地上传
  $('#bg-local-input').addEventListener('change', handleLocalUpload);

  // ---- Clock ----
  bindCheckbox('#clock-seconds', 'clock', 'showSeconds');
  bindCheckbox('#clock-date', 'clock', 'showDate');
  bindChange('#clock-hourformat', 'clock', 'hourFormat');
  bindChangeNum('#clock-fontsize', 'clock', 'fontSize');

  // ---- Search ----
  bindChange('#search-shortcut', 'search', 'shortcut');

  $('#search-engine').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      // 保持 defaultEngineUrl
    } else {
      currentSettings.search.defaultEngine = val;
    }
    scheduleSave();
    updateConditionalVisibility();
  });

  $('#search-engine-url').addEventListener('input', debounce(() => {
    currentSettings.search.defaultEngineUrl = $('#search-engine-url').value;
    if ($('#search-engine').value === 'custom') {
      currentSettings.search.defaultEngine = 'custom';
    }
    scheduleSave();
  }, SAVE_DEBOUNCE));

  // ---- General ----
  bindChange('#general-lang', 'general', 'language');

  // ---- 命令管理 ----
  $('#add-command-btn').addEventListener('click', showAddCommandModal);
  $('#export-commands-btn').addEventListener('click', exportCommands);
  $('#import-commands-btn').addEventListener('click', () => $('#import-commands-input').click());
  $('#import-commands-input').addEventListener('change', importCommands);

  // ---- 快捷键录制 ----
  $('#record-shortcut-btn').addEventListener('click', startRecordingShortcut);

  // ---- 导入/导出/重置 ----
  $('#export-btn').addEventListener('click', handleExport);
  $('#import-btn').addEventListener('click', () => $('#import-file-input').click());
  $('#import-file-input').addEventListener('change', handleImport);
  $('#reset-btn').addEventListener('click', handleReset);
}

// ========== 辅助函数 ==========

function bindChange(selector, section, key) {
  $(selector).addEventListener('change', (e) => {
    currentSettings[section][key] = e.target.value;
    scheduleSave();
  });
}

function bindRange(selector, section, key, displaySel) {
  $(selector).addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    currentSettings[section][key] = val;
    if (displaySel) {
      $(displaySel).textContent = val;
    }
    scheduleSave();
  });
}

function bindCheckbox(selector, section, key) {
  $(selector).addEventListener('change', (e) => {
    currentSettings[section][key] = e.target.checked;
    scheduleSave();
  });
}

function bindChangeNum(selector, section, key) {
  $(selector).addEventListener('change', (e) => {
    currentSettings[section][key] = Number(e.target.value);
    scheduleSave();
  });
}

function bindDebounced(selector, handler) {
  $(selector).addEventListener('input', debounce((e) => {
    handler(e.target.value);
  }, SAVE_DEBOUNCE));
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await setSettings(currentSettings);
      console.log('[Settings] Saved.');
    } catch (err) {
      console.error('[Settings] Save failed:', err);
    }
  }, SAVE_DEBOUNCE);
}

// ========== 条件显示 ==========

function updateConditionalVisibility() {
  const source = $('#bg-source').value;
  $('#group-bg-urls').style.display = source === 'url' ? '' : 'none';
  $('#group-bg-local').style.display = source === 'local' ? '' : 'none';
  $('#group-blur-level').style.display = $('#bg-blur-enabled').checked ? '' : 'none';
  $('#group-search-url').style.display = $('#search-engine').value === 'custom' ? '' : 'none';
}

// ========== 本地上传 ==========

function handleLocalUpload() {
  const files = Array.from($('#bg-local-input').files);
  if (files.length === 0) return;

  const readers = files.map(file => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve({ name: file.name, dataUrl: e.target.result });
      reader.readAsDataURL(file);
    });
  });

  Promise.all(readers).then(async (results) => {
    const dataUrls = results.map(r => r.dataUrl);
    currentSettings.background.localImages = [
      ...(currentSettings.background.localImages || []),
      ...dataUrls
    ];

    // 缓存到 IndexedDB
    for (let i = 0; i < results.length; i++) {
      const resp = await fetch(results[i].dataUrl);
      const blob = await resp.blob();
      await cacheImage(`local_${Date.now()}_${i}`, blob);
    }

    scheduleSave();
    renderLocalPreview();
  });
}

function renderLocalPreview() {
  const container = $('#bg-local-preview');
  if (!container) return;
  const images = currentSettings.background?.localImages || [];
  container.innerHTML = images.map(url =>
    `<img src="${url}" alt="local bg" />`
  ).join('');
}

// ========== 命令管理 ==========

function renderCommandsList() {
  const container = $('#commands-list');
  const commands = currentSettings.commands || [];

  if (commands.length === 0) {
    container.innerHTML = '<p style="color:#6e6e73;font-size:13px;">暂无自定义命令。内置命令：/google /bing /github /juejin /b</p>';
    return;
  }

  container.innerHTML = commands.map((cmd, idx) => `
    <div class="command-item">
      <span class="cmd-prefix">${escapeHtml(cmd.prefix)}</span>
      <span class="cmd-url">${escapeHtml(cmd.engineUrl || '')}</span>
      <span class="cmd-aliases">${(cmd.aliases || []).map(a => escapeHtml(a)).join(', ') || '—'}</span>
      <button class="cmd-delete" data-idx="${idx}" title="删除">✕</button>
    </div>
  `).join('');

  // 删除事件
  container.querySelectorAll('.cmd-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      currentSettings.commands.splice(idx, 1);
      scheduleSave();
      renderCommandsList();
    });
  });
}

function showAddCommandModal() {
  const existing = (scope || document).querySelector('.modal-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>添加自定义命令</h3>
      <div class="form-group">
        <label class="form-label">前缀（如 /gpt）</label>
        <input type="text" id="modal-prefix" class="form-input" placeholder="/gpt" />
      </div>
      <div class="form-group">
        <label class="form-label">搜索 URL（<code>{query}</code> 为占位符）</label>
        <input type="text" id="modal-url" class="form-input"
               placeholder="https://chat.openai.com/?q={query}" />
      </div>
      <div class="form-group">
        <label class="form-label">别名（逗号分隔，可选）</label>
        <input type="text" id="modal-aliases" class="form-input" placeholder="/g, /chat" />
      </div>
      <div class="modal-actions">
        <button id="modal-cancel" class="btn btn-outline">取消</button>
        <button id="modal-save" class="btn btn-primary">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', escHandler);
  };

  const escHandler = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', escHandler);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  $('#modal-cancel', backdrop).addEventListener('click', close);

  $('#modal-save', backdrop).addEventListener('click', () => {
    const prefix = $('#modal-prefix', backdrop).value.trim();
    const engineUrl = $('#modal-url', backdrop).value.trim();
    const aliasesRaw = $('#modal-aliases', backdrop).value.trim();

    if (!prefix || !engineUrl) {
      alert('前缀和搜索 URL 不能为空');
      return;
    }

    if (!engineUrl.includes('{query}')) {
      alert('搜索 URL 必须包含 {query} 占位符');
      return;
    }

    const aliases = aliasesRaw
      ? aliasesRaw.split(',').map(a => a.trim()).filter(Boolean)
      : [];

    currentSettings.commands = [...(currentSettings.commands || []), {
      id: Date.now().toString(36),
      prefix,
      aliases,
      engineUrl,
      enabled: true
    }];

    scheduleSave();
    renderCommandsList();
    close();
  });
}

function exportCommands() {
  const commands = currentSettings.commands || [];
  if (commands.length === 0) {
    alert('没有可导出的自定义命令');
    return;
  }
  downloadJSON('commands-export.json', commands);
}

function importCommands(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!Array.isArray(parsed)) throw new Error('格式错误');

      // 合并：同 prefix 覆盖
      const existing = currentSettings.commands || [];
      const merged = [...existing];
      for (const cmd of parsed) {
        if (!cmd.prefix || !cmd.engineUrl) continue;
        const existIdx = merged.findIndex(c => c.prefix === cmd.prefix);
        if (existIdx >= 0) {
          merged[existIdx] = { ...cmd, enabled: true };
        } else {
          merged.push({ ...cmd, id: Date.now().toString(36), enabled: true });
        }
      }
      currentSettings.commands = merged;
      scheduleSave();
      renderCommandsList();
    } catch (err) {
      alert('导入失败：' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ========== 快捷键录制 ==========

function startRecordingShortcut() {
  const btn = $('#record-shortcut-btn');
  btn.textContent = '请按键…';
  btn.style.background = '#ff3b30';
  btn.style.color = '#fff';

  function handler(e) {
    e.preventDefault();
    e.stopPropagation();

    let key = '';
    if (e.ctrlKey) key += 'Ctrl+';
    if (e.metaKey) key += 'Command+';
    if (e.altKey) key += 'Alt+';
    if (e.shiftKey) key += 'Shift+';

    // 忽略仅修饰键
    if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) {
      key += e.key;
    } else {
      key += e.key.length === 1 ? e.key.toUpperCase() : e.key;
    }

    $('#search-shortcut').value = key;
    currentSettings.search.shortcut = key;
    scheduleSave();

    btn.textContent = '录制快捷键';
    btn.style.background = '';
    btn.style.color = '';

    document.removeEventListener('keydown', handler);
  }

  document.addEventListener('keydown', handler);
}

// ========== 导入/导出/重置 ==========

async function handleExport() {
  const json = await exportConfig();
  downloadJSON('starter-config.json', JSON.parse(json));
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      await importConfig(ev.target.result);
      currentSettings = await getSettings();
      populateForm();
      renderCommandsList();
      updateConditionalVisibility();
      alert('配置导入成功！');
    } catch (err) {
      alert('导入失败：' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function handleReset() {
  if (!confirm('确定要重置所有设置为默认值吗？此操作不可恢复。')) return;

  resetSettings().then(async () => {
    currentSettings = await getSettings();
    populateForm();
    renderCommandsList();
    updateConditionalVisibility();
    alert('已重置为默认设置。');
  });
}

// ========== 工具函数 ==========

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
