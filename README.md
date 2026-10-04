# 求职管理

面向校招和社招求职者的求职工作区：把岗位、简历和投递进度放在一起。界面中文优先。

当前已实现的能力：

- **岗位与投递记录**：录入目标岗位，看板 / 表格 / 日历 / 洞察多种视图跟踪每份投递的阶段变化。
- **简历编辑**：多份结构化简历、模板布局、富文本与自定义样式。
- **导出**：一键导出 PDF 与 Word（DOCX）。
- **分享**：简历可通过公开链接分享，支持设置访问密码。
- **ATS 检查**：在浏览器本地解析简历 PDF，检查机器可读性，文件不上传。
- **求职信**：独立求职信库，可单独导出。
- **AI 辅助（可选）**：需自行配置模型服务后使用，当前支持岗位匹配评分、生成岗位定制简历副本、起草求职信与跟进消息；未配置时上述操作手动完成，核心功能不受影响。

产品界面基于上游项目 [Reactive Resume](https://github.com/reactive-resume/reactive-resume)（MIT 许可证，见 [LICENSE](./LICENSE)）二次开发，上游许可声明原样保留。

## 本地运行

前置要求：Node.js 24+、pnpm 12（由 `packageManager` 固定）、Docker（PostgreSQL / Redis）。

```bash
# 1. 安装依赖
pnpm install

# 2. 准备环境变量
cp .env.example .env.local   # 至少配置 APP_URL、DATABASE_URL、AUTH_SECRET

# 3. 启动基础设施（compose 文件以仓库根目录为准）
docker compose -f compose.dev.yml up -d postgres redis

# 4. 启动开发服务器（自动执行数据库迁移）
pnpm dev                     # http://localhost:3000
```

生产构建与运行：

```bash
pnpm build
NODE_ENV=production PORT=3000 node apps/server/dist/index.mjs
```

## 配置

环境变量通过根目录 `.env.local` 提供（`packages/env` 负责校验）：

- `APP_URL`：站点对外地址，用于分享链接、邮件与 SEO。
- `DATABASE_URL`：PostgreSQL 连接串；生产模式启动时自动执行迁移。
- `AUTH_SECRET`：认证签名密钥（任意非空字符串）。
- `REDIS_URL`、`ENCRYPTION_SECRET`：可选；保存 AI 模型配置与使用 Agent 工作区时必需。
- `SMTP_*`：可选；未配置时验证邮件内容打印到服务端日志。
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET`：可选；不配置时使用本地文件存储。

本地持久数据写入 `data/` 目录（可用 `LOCAL_STORAGE_PATH` 覆盖），该目录不进入 Git。

## 仓库结构与开发

- pnpm monorepo（Turborepo）：`apps/web`（React 19 SPA）+ `apps/server`（Hono 单进程，同时承载 API 与静态站点）。
- 工程规范、目录归属和验证命令见 [AGENTS.md](./AGENTS.md)。
- 开发计划与验收记录分别在 `docs/plans/`、`docs/acceptance/`。
- 部署脚本与服务器部署说明见 `tooling/deployment/`。

## 许可证

[MIT](./LICENSE)。原始许可证与上游版权声明（Copyright (c) 2026 Amruth Pillai）原样保留。
