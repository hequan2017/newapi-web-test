# 仓库协作指南（AGENTS）

本文件是 `newapi-web-test` 子项目（Vue 3 + Vite 的 New API 模型测试客户端）的协作约定：项目结构、构建/测试命令、代码风格、测试、提交规范、安全配置。

## 项目结构与模块组织

- `src/main.js`：Vue 应用入口，导入全局样式。
- `src/App.vue`：主 UI 与任务轮询流程。
- `src/api.js`：API 辅助函数、payload 构造、URL 拼接、终态状态判断。
- `src/modelPresets.js`：能力配置、表单默认值、payload 构造（模型默认值与下拉选项集中在此）。
- 连接地址与 API Key：仅在 Web 页面的连接设置中临时输入，不从仓库配置读取。
- `src/api.test.js` 等 `*.test.js`：Vitest 单测。
- `src/styles.css`：全局页面与组件样式。
- `vite.config.js`：Vue、Vitest、dev server 端口 `5173`、`/api` 代理。
- 项目不读取包含服务地址或凭据的 `.env` 配置；本地环境文件统一忽略。
- `dist/`、`node_modules/`：生成目录，不应手工编辑。

## 构建、测试与开发命令

```bash
npm install        # 按 package-lock.json 安装依赖
npm run dev        # 启动 Vite dev server，监听 0.0.0.0:5173
npm run build      # 构建生产产物到 dist/
npm run test       # 运行 Vitest 测试套件
```

## 代码风格与命名约定

使用 ES modules、单引号、分号、2 空格缩进，与现有文件保持一致。尽量保持 `src/api.js` 等 API 辅助为纯函数，便于测试。变量与函数用 `camelCase`，稳定常量用 `UPPER_SNAKE_CASE`，Vue 组件文件用 `PascalCase`。仓库未配置格式化器或 linter，改动尽量小且与周围代码一致。

## 测试指南

测试用 Vitest，`jsdom` 环境配置在 `vite.config.js`。单测文件放在被测代码旁，用 `*.test.js` 后缀。优先为 payload 形状、URL 生成、请求头、状态处理写聚焦测试。提交行为改动前先跑 `npm run test`。

## 提交与 PR 规范

历史使用 Conventional Commit 风格，如 `feat(newapi-test): 新增New API视频生成Web测试客户端`。尽量用 `type(scope): summary`，如 `fix(api): handle empty metadata`。PR 应包含简短变更说明、验证命令与结果、相关 issue 链接、UI 改动截图；除非必要，不要包含 `.env.local`、生成的 `dist/` 或依赖变更。

## 安全与配置

不要把真实服务地址或 API Key 写入源码、环境变量、运行时配置或文档。两者仅允许在 Web 页面的连接设置中临时输入，应用不得持久化。本项目定位为本地或受控环境的测试工具。
