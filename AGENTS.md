# AGENTS.md — 起始页 (New Tab Starter)

## 项目概述

一个简洁优雅的浏览器新标签页扩展（Chrome/Edge Manifest V3），替换浏览器默认的新标签页，提供**背景图 + 实时时钟 + 智能搜索框**的起始页体验。

- **名称**：起始页 / New Tab Starter
- **默认语言**：中文（支持 English）
- **最低浏览器**：Chrome 88+ / Edge 88+（Manifest V3）

## 核心功能

### 1. 背景图系统 (`lib/background.js`)
- **Bing 每日图片**：自动拉取 Bing 每日壁纸，Service Worker 定时缓存（每 6 小时），离线时从 IndexedDB 读取
- **本地上传**：用户可上传本地图片，以 dataURL 形式存储
- **远程 URL**：支持多个远程图片 URL，逗号分隔
- **填充模式**：cover / contain / fill
- **暗色遮罩**：0–60% 可调，渐变遮罩确保上层文字可读性
- **背景模糊**：开关控制，1–10 级强度，聚焦搜索框时自动增强模糊
- **轮播**：多图轮播，间隔可配（0 = 关闭）

### 2. 时钟模块 (`lib/clock.js`)
- `requestAnimationFrame` 驱动的高精度时钟，非 `setInterval`
- 24/12 小时制切换
- 秒钟、日期可独立开关
- 5 档字体大小（32/40/48/56/64）
- **冻结机制**：搜索框聚焦时冻结时间显示（视觉优化），失焦恢复
- 页面卸载自动清理

### 3. 智能搜索框 (`lib/search.js` + `lib/commands.js`)
- **搜索引擎切换**：百度（默认）、Google、Bing、DuckDuckGo、搜狗、360 搜索 + 自定义
- **命令系统**：`/prefix query` 临时切换搜索引擎
  - 内置：`/google`、`/bing`、`/github`、`/juejin`、`/b`（Bing 别名）
  - 自定义命令：用户可在设置页添加任意搜索引擎前缀
  - 命令别名支持
- **实时提示**：输入 `/` 开头的文字时自动前缀匹配并显示提示，Tab 键补全
- **单键快捷键**：页面内配置（默认 `/`），在非输入区域按键即唤起搜索框
- **全局快捷键**：Chrome 扩展快捷键 `Cmd+K` / `Ctrl+K` 从任意页面唤起

### 4. 设置页面 (`settings.html` + `settings.js`)
- 独立设置页（`options_page`），四组分区：背景 / 时间 / 搜索 / 命令管理
- 表单修改自动保存，500ms 防抖写入 `chrome.storage.sync`
- 快捷键录制器：可视化录制组合键
- 配置导入/导出（JSON），localImages 自动排除以控制导出体积
- 命令导入/导出：支持自定义命令独立迁移
- 重置默认设置
- 所有 UI 支持中/英国际化字符串（`_locales/`）

## 技术架构

### 文件结构

```
├── manifest.json          # Manifest V3 声明
├── newtab.html            # 新标签页 HTML（替换 chrome://newtab）
├── newtab.js              # 新标签页入口：模块加载 + 初始化 + 消息监听
├── newtab.css             # 新标签页样式（CSS 变量 + 毛玻璃效果）
├── service-worker.js      # MV3 Service Worker：Bing 定时缓存 + 全局快捷键响应
├── settings.html          # 设置页 HTML
├── settings.js            # 设置页逻辑：表单绑定 + 自动保存 + 导入导出
├── settings.css           # 设置页样式
├── lib/
│   ├── background.js      # 背景图系统：Bing/本地/URL 源 + 渲染 + 轮播
│   ├── clock.js           # RAF 驱动时钟 + 冻结机制
│   ├── commands.js        # 命令解析引擎：内置命令 + 自定义命令 + 搜索路由
│   ├── search.js          # 搜索框交互：输入 + 提示 + 背景/时钟联动
│   └── storage.js         # 存储层：chrome.storage.sync + IndexedDB 封装
├── _locales/
│   ├── zh_CN/messages.json  # 中文字符串
│   └── en/messages.json     # 英文字符串
└── assets/icons/           # 扩展图标（16/48/128）
```

### 数据流

```
用户操作 → newtab.js/settings.js
       ↓
lib/storage.js (getSettings / setSettings)
       ↓
chrome.storage.sync (配置持久化，跨设备同步)
       ↑
chrome.storage.onChanged → onSettingsChanged 回调 → 热更新各模块
```

### 图片缓存流

```
Service Worker (每6h)
  → fetch Bing API → 下载图片 → IndexedDB (starter_db / images store)
  → 通知所有 newtab 页面刷新背景

Newtab 页面
  → 先读 IndexedDB 缓存 → 回退到实时 fetch → 降级纯色背景
```

### 跨组件通信

- **SW → newtab**：`chrome.tabs.sendMessage` 发送 `focus-search` 或 `refresh-background`
- **全局快捷键 → newtab**：`chrome.commands.onCommand` → SW 转发消息
- **设置页 → newtab**：通过 `chrome.storage.onChanged` 事件实现热更新

## 关键设计决策

1. **ES Modules**：所有 JS 使用原生 ES module，无打包工具，保持零依赖
2. **chrome.storage.sync**：配置持久化在 sync 区域，支持跨设备同步（需登录 Chrome 账号）
3. **IndexedDB**：图片等大文件存在 IndexedDB，避免 sync 存储 100KB 限制
4. **deepMerge 默认值**：`getSettings()` 始终合并默认值，确保新增配置项向后兼容
5. **防抖保存**：设置页 500ms 防抖，避免频繁写入 storage
6. **静默失败**：所有网络请求和后台任务采用静默失败策略，不影响核心功能
7. **requestAnimationFrame 时钟**：比 setInterval 更节能、更精确，页面隐藏时自动暂停

## 权限说明

| 权限 | 用途 |
|------|------|
| `storage` | 配置持久化 |
| `alarms` | 定时拉取 Bing 每日图 |
| `unlimitedStorage` | IndexedDB 缓存大量图片 |
| `https://www.bing.com/*` | 拉取 Bing 每日图片 API 和实际图片 |

## 开发约定

- **注释语言**：代码注释使用中文，日志输出使用英文
- **命名风格**：camelCase 变量/函数，kebab-case CSS 类名，SCREAMING_SNAKE_CASE 常量
- **模块职责**：`lib/` 下每个文件是独立模块，通过 `export` 暴露接口，不互相依赖（除 `search.js` 依赖 `commands.js` 和 `background.js`）
- **错误处理**：网络/存储类操作用 try-catch + 静默降级，用户交互类用 alert（设置页）
- **无构建步骤**：纯原生 Web 技术栈，不需要 npm/Node.js

## 发布流程

1. 更新 `manifest.json` 中的 `version`
2. 确保 `_locales` 中的字符串与 UI 文案同步
3. 打包为 `.zip`（根目录文件 + `lib/` + `_locales/` + `assets/`）
4. 提交至 Chrome Web Store / Edge Add-ons 审核
