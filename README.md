# NBA 编辑工作台（NBA Editorial Content Generation Platform）

面向体育编辑的一站式 NBA 内容生产工具：自动写文案、查球星历史数据、盯当日比分与新闻。

**在线访问（GitHub Pages）**：https://eatonz3927.github.io/NBA-Editorial-Content-Generation-Platform/

## 架构：纯前端 BYOK

本应用为**纯静态站点**，无需任何后端 / 数据库，可直接部署到 GitHub Pages：

- **数据来源**：比分、新闻、联盟数据榜、球员档案与生涯数据均由访问者的浏览器**直连 ESPN 公开接口**获取（CORS 开放），缓存落在各自浏览器的 localStorage。
- **AI 文案生成（BYOK）**：首次打开会引导填入自己的 **阿里云 DashScope API Key**（默认模型 deepseek-v4-flash）。Key 只保存在本人浏览器的 localStorage 中，点击「生成文案」时由浏览器直接请求 DashScope，不经过任何中转服务器。
- **草稿箱**：保存在本浏览器 localStorage，每个使用者各自一份。

## 功能

| 模块 | 说明 |
| --- | --- |
| 🏀 比分中心 | 按日期查看比分（月历选择器），热点球员标签，可一键「用这场比赛生成文案」 |
| 📰 新闻中心 | 每 12 小时自动抓取 ESPN 最新新闻（北京时间 0/12 点边界），保留最近 10 天，支持手动刷新（仅当前页面预览），可「改写成快讯」 |
| 🔎 球星检索 | 中英文搜索，球员档案、分赛季数据（常规赛/季后赛）、生涯汇总、近期出场、荣誉 |
| ✍️ 文案工作台 | 比赛比分 / 球员数据 / 新闻素材自由组合，9 种文体 × 5 种语气 × 3 种篇幅，AI 生成（未配置 Key 时回退本地模板引擎） |
| 🗂️ 草稿箱 | 本地保存、展开、复制、删除 |
| 🌗 日间/夜间 | 按本机时段默认（9:00–18:00 日间），可随时手动切换并记住选择 |

## 本地开发

```bash
npm install
npm run dev        # http://localhost:3000
```

## 部署到 GitHub Pages

仓库已内置 `.github/workflows/pages.yml`：推送 `main` 分支即自动构建静态站点（`next build` → `out/`）并发布。

首次使用需在仓库 **Settings → Pages → Source** 选择 **「GitHub Actions」**。

构建时通过环境变量 `PAGES_BASE_PATH=/NBA-Editorial-Content-Generation-Platform` 注入子路径前缀（项目页路径）；本地开发无需设置。

## 给编辑同事使用

1. 打开 Pages 地址；
2. 首次进入会跳转到「密钥设置」页，填入 DashScope Key（[阿里云百炼控制台](https://bailian.console.aliyun.com/?apiKey=1#/api-key) 免费获取）；
3. 比分 / 新闻 / 球员数据浏览无需 Key；仅「生成文案」需要。

> 免责声明：本工具仅用于内容创作辅助，非 NBA 官方产品；生成内容发布前请人工核对。
