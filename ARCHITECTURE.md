# 项目架构与技术栈

《饥荒单机版 Wiki · 生存指南》静态单页站点。全部页面逻辑内联在 `index.html` 中，图片素材通过 Node 脚本预加工为 WebP 雪碧图，部署在 GitHub Pages。

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | 原生 HTML5 + CSS3 + JavaScript | 无框架、无构建步骤，ES5 兼容写法，单文件自包含 |
| 图片处理 | Node.js + [sharp](https://sharp.pixelplumbing.com/) | 本地工具链，用于生成雪碧图与站点图标（仅开发依赖） |
| 数据 | 静态 JSON | `data/characters.json` 结构化数据 |
| 部署 | GitHub Pages | 纯静态托管，无后端 |

前端全部特性一览：

- 板块切换（Tab 导航，10 个板块）
- 可展开条目卡片
- 深色 / 浅色主题切换（`localStorage` 持久化）
- 简洁 / 默认视图模式（`localStorage` 持久化）
- 全局搜索（带结果跳转）
- 雪碧图后台预加载（页面加载完成后空闲预取所有板块资源）

## 目录结构

```
don-t-starve-together-wiki/
├── index.html                  # ★ 站点唯一入口（约 129 KB / 1040 行）
│                               #   HTML 结构 + 内联 CSS + 内联 JS 全部在此
│
├── assets/                     # 生成产物：雪碧图 + 切片规则 + 站点图标
│   ├── sprites.css             # 由脚本生成：每个图标切片的 background-position 规则
│   ├── sprite-map.json         # 由脚本生成：切片 → 雪碧图 / 坐标 / 尺寸 映射
│   ├── sprite-characters.webp  # 角色板块雪碧图（57 KB）
│   ├── sprite-items.webp       # 道具板块雪碧图（28 KB）
│   ├── sprite-creatures.webp   # 生物板块雪碧图（107 KB）
│   ├── sprite-survival.webp    # 生存板块雪碧图（63 KB）
│   ├── sprite-weather.webp     # 天气板块雪碧图（26 KB）
│   ├── sprite-caves.webp       # 地下板块雪碧图（161 KB）
│   ├── sprite-crafting.webp    # 配方板块雪碧图（62 KB）
│   ├── sprite-shared.webp      # 跨板块通用图标（12 KB）
│   ├── favicon-16.png          # 站点图标 16px
│   ├── favicon-32.png          # 站点图标 32px
│   └── apple-touch-icon.png    # iOS 主屏图标 180px
│
├── images/                     # 原始素材：116 张 WebP（img-001 ~ img-116）
│                               #   全部被 index.html 引用，作为雪碧图的唯一数据源
│
├── data/
│   └── characters.json         # 角色结构化数据（JSON）
│
├── tools/
│   └── generate-sprite.js      # ★ 雪碧图生成流水线（Node + sharp）
│
├── index.html.bak              # generate-sprite.js 每次运行时自动覆盖的备份，勿手改
├── package.json                # 依赖声明（仅 sharp）
├── package-lock.json
├── README.md                   # 项目说明（描述的是早期 base64 内嵌版本，已过时）
└── node_modules/               # npm 依赖（仅本地生成工具使用，不入库）
```

## 核心架构

### 1. 单页自包含

`index.html` 是一个完整的静态单页：

- **CSS** 内联于 `<style>`（无外部样式表，`styles.css` 等遗留文件已移除）
- **JS** 内联于 `<script>`（板块切换、搜索、主题、卡片交互等）
- **图片** 不内联，全部通过 `assets/sprites.css` 的 `background-image` 引用雪碧图

因此整个站点只需一次 HTTP 请求加载 `index.html`，再按需加载雪碧图资源。

### 2. 雪碧图生成流水线

```
images/*.webp (116 张原始素材)
        │
        │  tools/generate-sprite.js (Node + sharp)
        │  ① 按板块分组（characters / items / creatures / ...）
        │  ② 预缩放：大图缩到「最大显示尺寸 × 3」(≤144px)，小图板块不放大
        │  ③ 每板块合成一张 WebP 雪碧图（quality 90）
        │  ④ 生成 sprites.css（切片 background-position 规则）
        │  ⑤ 生成 sprite-map.json（坐标映射）
        ▼
assets/sprite-*.webp  (8 张，总计约 517 KB)
```

重新生成：

```bash
npm install        # 安装 sharp（首次）
node tools/generate-sprite.js
```

### 3. 性能优化要点

| 手段 | 效果 |
|---|---|
| 大图预缩放后再合成 | 生物板块雪碧图 6 MB → 340 KB（PNG 时代） |
| WebP 有损输出（quality 90） | 全部雪碧图 1.7 MB → 517 KB（-70%） |
| 按板块拆分雪碧图 | 首屏只加载当前板块资源 |
| 后台预加载所有板块 | 点击任意板块即时显示，无现场下载 |
| 即时滚动 + 短动画（0.12s） | 板块切换无延迟感 |

### 4. 页面板块

`index.html` 内 10 个板块，通过 `.nav-tab[data-page]` 与 `.page-section#page-*` 关联，由 `switchPage()` 切换（`display:none/block`）：

`characters` / `items` / `creatures` / `survival` / `weather` / `caves` / `crafting` / `faq` / `changelog` / `about`

## 本地运行

无需构建，直接静态托管：

```bash
npx --yes http-server . -p 8766
# 打开 http://127.0.0.1:8766/index.html
```

修改图片素材后需重新运行 `node tools/generate-sprite.js` 再刷新页面。
