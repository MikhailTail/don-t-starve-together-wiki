# 饥荒单机版 Wiki · 生存指南

《Don't Starve（饥荒）》单机玩法的离线静态单页 Wiki，包含角色、道具、生物、生存技巧、天气、地下、配方等速查内容。支持深色/浅色主题、简洁视图模式、全局搜索与可展开条目卡片。

## 快速开始

无需构建，直接静态托管即可：

```bash
npx --yes http-server . -p 8766
# 打开 http://127.0.0.1:8766/index.html
```

## 技术栈

- **前端**：原生 HTML5 + CSS3 + JavaScript（无框架、单文件自包含，全部逻辑内联在 `index.html`）
- **图片**：WebP 雪碧图（由 Node.js + [sharp](https://sharp.pixelplumbing.com/) 生成）
- **部署**：GitHub Pages 纯静态托管

## 目录结构

```
├── index.html                  # 站点唯一入口（结构 + 内联 CSS/JS）
├── assets/                     # 生成产物：8 张板块雪碧图 + sprites.css + 站点图标
├── images/                     # 原始素材：116 张 WebP（img-001 ~ img-116）
├── data/characters.json        # 角色结构化数据
├── tools/generate-sprite.js    # 雪碧图生成流水线
└── ARCHITECTURE.md             # ★ 项目架构与技术栈详细文档
```

## 修改素材后重新生成

```bash
npm install                      # 首次安装 sharp
node tools/generate-sprite.js    # 重新生成 assets/sprite-*.webp 与 sprites.css
```

## 部署到 GitHub Pages

推送到 `main` 分支即可（仓库为纯静态站点，无需任何配置），等待数分钟刷新生效。

## 性能亮点

- 素材预缩放后合成雪碧图：生物板块 6 MB → 340 KB（PNG 时代）
- WebP 输出：全部雪碧图共 **约 517 KB**
- 后台预加载全部板块：点击任意板块即时显示，无加载过程
- 板块切换即时滚动 + 短动画，无延迟感

---

详细架构说明见 [ARCHITECTURE.md](ARCHITECTURE.md)。
