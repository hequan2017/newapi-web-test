[简体中文](README.md) | [English](README.en.md)

# newapi-web-test

一个基于 Vue 3 + Vite 的开源多模态模型调试前端，用于在浏览器中验证文字、图片、语音和视频模型请求。

![Vue 3](https://img.shields.io/badge/Vue-3.x-42b883) ![Vite](https://img.shields.io/badge/Vite-5.x-646CFF) ![Test](https://img.shields.io/badge/test-Vitest-green)

![界面预览](docs/screenshot.png)

## 项目介绍

调试多模态模型时，经常要反复拼 curl、改参数、看原始响应。本项目把这一过程做成一个纯静态网页：选择能力（文字/文生图/图生图/语音/视频），填好模型和参数即可在浏览器中直接提交，并查看请求预览、原始响应与错误诊断。

项目不内置任何 API 服务地址、API Key、密码或运行时密钥配置。首次打开页面时只有一个"测试环境"，连接地址和 Key 均为空，必须通过右上角"连接设置"临时填写。适合需要快速验证 New API 等 OpenAI 兼容网关及各类大模型接口的开发者和运维人员。

## ✨ 功能特性

- **文字对话**：`/v1/chat/completions`，支持系统提示词、温度和 Max Tokens
- **文生图**：`/v1/images/generations`，Gemini 模型自动切换到原生 `generateContent`
- **图生图**：`/v1/images/edits`（multipart），支持本地图片与图片 URL
- **语音合成**：指令式 `cosyvoice-v3-flash` 音频生成，支持旁白/对话模式、音色和输出格式
- **视频生成**：`/v1/videos` 创建任务、每 5 秒轮询状态（最多 200 次）、鉴权播放与下载
- **双模式提交**：表单与 JSON 两种提交方式，可切换查看请求预览和原始响应
- **调试辅助**：错误诊断、调试数据一键复制
- **本地历史**：最多 50 条浏览器本地历史记录，Authorization 信息脱敏展示
- **界面**：中英文双语与深浅色主题

### 安全设计

连接配置遵循"页面输入、会话使用"的原则：

- API Base URL 和 API Key 不从 `.env`、Docker 环境变量、源码或运行时配置读取
- API Key 使用密码输入框，支持临时显示或隐藏；页面刷新后连接配置自动清空
- API Key 不写入 LocalStorage、请求历史或浏览器控制台
- Key 为空时禁止提交，并自动打开连接设置提醒用户补充

> 历史记录会在当前浏览器的 LocalStorage 中保存请求 URL、请求参数和响应结果。共享设备使用完毕后，请在页面中清空历史记录。

## 🛠 技术栈

| 分类 | 组件 | 版本 |
| --- | --- | --- |
| 前端框架 | Vue | 3.5 |
| 构建工具 | Vite | 5.4 |
| 测试 | Vitest + jsdom + @vue/test-utils | 2.x |
| 容器 | Node 20-alpine 构建 + Nginx 1.27-alpine 托管静态站点 | - |

## 🚀 快速开始

```bash
npm ci
npm run dev      # 启动 Vite 开发服务器，默认监听 5173 端口（环境要求 Node.js 18+，推荐 20）
npm run test     # 运行 Vitest 测试
npm run build    # 构建生产产物到 dist/
```

打开页面后：

1. 点击右上角"连接设置"。
2. 输入完整的 API Base URL 和 API Key。
3. 点击"保存并使用"。
4. 选择能力、模型和参数后提交请求。

连接配置只存在于当前页面会话，刷新页面后需要重新填写。

### GitHub Pages 一键部署

仓库包含 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)，推送到 `main` 后自动测试、构建并发布 `dist/`，无需配置任何 Secret：

1. 将项目推送到 GitHub 仓库的 `main` 分支。
2. 打开仓库 `Settings -> Pages`，将 Source 设为 `GitHub Actions`。
3. 等待 `Deploy to GitHub Pages` 完成，也可在 Actions 页面通过 `workflow_dispatch` 手动发布。
4. 进入 Pages 站点，在"连接设置"中填写自己的 API 地址和 Key。

GitHub Pages 只托管静态前端，浏览器会直接请求用户填写的 API 地址，因此 API 服务需支持 HTTPS、CORS 以及 `GET`/`POST`/`OPTIONS` 方法和 `Authorization`、`Content-Type` 请求头。如果 API 不允许跨域，请在自己的域名下部署反向代理，不要把代理凭据写入本仓库。

### Docker 部署

Docker 镜像只包含静态前端（Nginx 托管 `dist/`），不读取任何服务地址或凭据环境变量。

```bash
docker build -t newapi-model-tester .
docker run --rm -p 5173:80 newapi-model-tester
# 或
docker compose up -d
```

## 📁 目录结构

```text
.
├── .github/workflows/       # GitHub Pages 自动部署
├── nginx/                   # Docker 静态站点配置
├── src/
│   ├── App.vue              # 页面、连接设置、任务和历史流程
│   ├── api.js               # 请求、URL、Header 和任务状态辅助函数
│   ├── i18n.js              # 中英文文案
│   ├── modelPresets.js      # 能力、模型、默认值和 Payload 构造
│   └── *.test.js            # Vitest 单元与组件测试
├── Dockerfile / docker-compose.yml
└── vite.config.js
```

## 📸 截图

![界面预览](docs/screenshot.png)

![对话测试](docs/screenshot-chat.png)

![文生图测试](docs/screenshot-image-gen.png)

## 📄 License

仓库暂未附带 LICENSE 文件，如需二次分发请先与作者确认。

## 贡献

改动应保持 ES modules、单引号、分号和 2 空格缩进。行为变更需要补充聚焦测试，并确保 `npm run test` 与 `npm run build` 通过。
