# 项目规范（interview-manage）

## 目标与当前阶段

基于 Reactive Resume，为校招、社招求职者提供真实经历管理、岗位录入、AI 定制简历和投递跟踪。当前已完成 P0 前置：规划文件、初始规范，并引入上游固定提交作为开发基线（见下方"上游基线"）。

## 工作原则

- 默认中文沟通，代码、命令、变量名和 commit message 使用英文。
- 用户体验优先；复用底座已有能力，避免重复建设。重复三次的操作优先考虑自动化。
- 开发前阅读本文件与开发计划。调整规范时先改文档，再改实践。
- 不编造简历经历、学历、任职时间、技能或业绩数字；AI 不得回写已确认的主经历事实。
- 密钥、密码、真实简历和用户截图不得进入 Git；日志不得记录明文密钥及简历正文。
- 改动后执行适当的测试、类型检查和构建；分别报告真实验证、Mock 和未验证结果。
- 不自动 git push，不自动公网部署；部署使用项目自有命令。

## 目录与文件约定

- `docs/plans/`：开发计划，命名为 `YYYY-MM-DD-主题.md`；保留决策记录，修订时同步日期与状态。
- `docs/acceptance/`：验收与基线检查记录，命名为 `YYYY-MM-DD-主题.md`。
- 引入 Reactive Resume 后保留其 monorepo 结构，并合并上游 AGENTS.md 的工程规范（见下半部分），不覆盖本项目约束。
- 前端进入上游 web 功能目录；API 业务进入对应功能包；数据库和迁移、PDF/DOCX 渲染分别归其现有包管理。
- `tooling/`：开发、部署和维护脚本；不得混入业务包。
- `data/`：本地持久数据（上游本地文件存储默认写入此处），禁止进入 Git；用户原件、历史导出按业务删除规则管理，不作为临时文件清理。
- `artifacts/`：未来验证产物，禁止进入 Git；交付时仅保留脱敏验收证据，清除无用中间产物。
- 临时处理文件成功后立即清理；异常遗留文件在 24 小时内清理。

## 产品展示与品牌规范（2026-10-04 起）

- 产品展示名暂定"求职管理"，集中定义在 `packages/utils/src/brand.ts`（`./brand` 导出）；页面、邮件、认证、SEO 使用该单一来源，不得在各处散落硬编码。
- 面向用户的展示文案不得出现原项目（Reactive Resume）的推广内容：作者介绍、GitHub 星标/仓库推广、社区统计、捐赠与赞助入口、原站（rxresu.me / docs.rxresu.me）链接和 Crowdin 翻译征集。
- 根目录 `LICENSE` 的 MIT 许可与原作者版权声明原样保留；内部文档、Git 历史和上游基线信息不变。`@reactive-resume/*` 包名、导入格式兼容标识和必要第三方声明不是展示文案，允许保留。
- 未实现的能力不得宣传：首页、导航和帮助文案只描述已上线的功能；AI 相关文案须写明当前实际支持的操作与配置要求。
- 站点 URL 一律取当前 origin 或 `APP_URL`，不得把公网 IP 或原站地址写死进展示代码。
- 隐私与数据说明必须描述本服务真实的数据存储、AI 数据流和删除方式，不沿用其他网站的承诺，不虚构运营主体或联系方式。

## 实施与验证约定

- 工作区：`D:\program\interview-manage`。
- 开发计划：`docs/plans/2026-10-02-ai-job-resume-management.md`。
- 上游基线：`reactive-resume/reactive-resume` 的提交 `b53c43c3722741946603ac46beda173931aeb646`（已通过 git 历史核实，main 分支初始提交即该提交）；MIT 许可证及版权声明（Copyright (c) 2026 Amruth Pillai）随上游 `LICENSE` 保留。
- 依赖和命令以固定提交的实际配置为准；不可把文档中的示例当作已经执行成功。
- 底座引入后运行适用的 `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:e2e`、`pnpm exec turbo boundaries`。
- 上游 `pnpm check` 会修改文件；只读检查使用无写入参数的 Biome 命令。
- 未获得真实模型、样本或运行环境时，明确标记相关验收缺口，不用静态配置或 Mock 代替真实验证。

### 本机 Windows 运行约定（P0 基线实测，详见 `docs/acceptance/2026-10-03-p0-baseline.md`）

- Node 用 **24.9.0+**（`D:\Development_environment\nvm\v24.9.0`）：24.0.2 的 Windows EMFILE 回归会破坏服务端 PDF 渲染与多个测试包。
- git `core.autocrlf` 保持 **false**（本仓已设置）；否则 tooling 的 committed 生成物断言失败。
- 宿主机 5432 被本机 PostgreSQL 16 服务占用；基础设施用 `docker compose -f compose.dev.yml -f tooling/compose.dev.win.yml up -d postgres redis`，`DATABASE_URL` 指向 `localhost:5433`。
- 跑单元测试前临时移走根目录 `.env`（测完恢复）：`packages/env` 会自动加载它，导致测试连上真实 Redis 相互污染。
- e2e：`DATABASE_URL=... pnpm exec playwright test --workers=2`，服务器需以 `FLAG_DISABLE_API_RATE_LIMIT=true` 运行（上游 CI 同款），否则并行注册触发 429。服务端 PDF 渲染要外联 fonts.gstatic.com；本机直连下 Node fetch 默认 IPv6 优先会超时，e2e 进程需带 `NODE_OPTIONS=--dns-result-order=ipv4first`。并行 worker 数更高时本机资源会饿死用例，auth `config-lifecycle` 与 pdf 渲染类测试尤其敏感，失败时先隔离单跑复核。
- 生产模式验证服务器：`NODE_ENV=production PORT=3000 node apps/server/dist/index.mjs`（读取根目录 `.env`）。

### 服务器部署约定（2026-10-04 起生效，详见 `docs/acceptance/2026-10-04-server-deployment.md`）

- 公网入口 `http://8.148.199.165:3012`（Nginx → `127.0.0.1:3001` → 容器 3000）；部署文件在 `tooling/deployment/server/`，服务器目录 `/opt/interview-manage/`。
- 镜像在本机构建后传输（`docker save | gzip`，约 300MB）；SSH 大流量会被链路间歇掐断，用追加式断点续传，必要时走阿里云云助手（`aliyun ecs RunCommand --profile deploy`）。
- 服务器无公网出口：镜像 tag 需用服务器已有镜像；app 字体等出站 fetch 依赖宿主机 mihomo（compose 内 `NODE_USE_ENV_PROXY` 已配）。
- 测试自连一律用 `127.0.0.1:3012`，hairpin 公网 IP 不可靠；冒烟时 APP_URL 与 SMOKE_URL origin 必须一致。

## 与上游合并的工程规范说明

- 合并自上游 `AGENTS.md`（提交 `b53c43c3`），仅保留工程规范内容。
- 上游的 `caveman` 人格指令块与本项目"默认中文沟通、完整可读表达"的要求冲突，未合并；`intent-skills` 技能加载流程保留。
- 上游更新合入时，重新执行此合并流程，并保持本项目约束在文件前部。

<!-- 上游工程规范开始（origin: reactive-resume/reactive-resume @ b53c43c3722741946603ac46beda173931aeb646, AGENTS.md） -->

## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

## Agent skills

- Issues and specs: GitHub Issues for `reactive-resume/reactive-resume`. See `docs/agents/issue-tracker.md`.

## Overview

Reactive Resume is a pnpm monorepo (Turborepo) with two deployable apps: `apps/web` (React 19 SPA with TanStack Router and Vite) and `apps/server` (Hono / Node.js). The production Docker image runs a single Node.js process on port 3000; `apps/server` mounts the API/auth/MCP/static routes and serves the built web app.

Internal packages are source-consumed through `package.json` export maps pointing at `src` files. Do not assume package-local `dist` output exists unless a package explicitly adds it.

Prerequisites: **Node.js 24** (pinned in `.nvmrc`; matches Dockerfile `ARG NODE_VERSION=24`), **pnpm 12.6.0** (pinned by `packageManager` in the root `package.json`; pnpm self-manages to it, so any recent pnpm can bootstrap — the Dockerfile's `ARG PNPM_VERSION` only picks the base image) ([install guide](https://pnpm.io/installation)), and **Docker** for PostgreSQL.

## Ownership map

Where each concern lives, and where new code for it goes:

| Area | Owner |
|------|-------|
| Web routes, loaders, user-facing workflows | `apps/web/src/routes`, `apps/web/src/features` (file-based; never hand-edit `routeTree.gen.ts`) |
| Server HTTP routes/adapters, startup checks, static handlers, MCP transport, OpenAPI/well-known | `apps/server/src/{http,rpc,mcp,openapi,static,startup}` |
| Authenticated API contracts + business logic | `packages/api/src/features/*` (oRPC routers, DTOs, rate limiting; aggregated at `@reactive-resume/api/routers` for `/api/rpc`) |
| Auth | `packages/auth` (Better Auth config/helpers/types; `apps/server/src/http/auth.ts` delegates to `auth.handler`) |
| DB client + schema | `packages/db` (Drizzle; migrations at repo root `migrations/`) |
| Server env validation | `packages/env` (auto-loads root `.env`) |
| Resume/page/template Zod schemas | `packages/schema` |
| Pure resume-domain behavior (no DB/HTTP/DOM/renderer deps) | `packages/resume` (JSON Patch helpers, social-network icons) |
| Resume PDF rendering | `packages/pdf` (React PDF document, font registration, template primitives, browser/server adapters) |
| PDF.js viewer/canvas UI | `apps/web/src/features/resume` — never in `packages/pdf` |
| DOCX export | `packages/docx` |
| MCP tools/prompts/resources/server-card | `packages/mcp` |
| Generic UI primitives + hooks | `packages/ui` (Base UI/shadcn-style); workflow-specific UI stays in the owning web feature |
| Focused support surfaces | `packages/fonts`, `packages/email`, `packages/import`, `packages/ai`, `packages/utils`, `packages/config` — prefer existing exports over cross-package shortcuts |
| Dev-only scripts | `tooling/`, not `packages/`, so packages only hold runtime-bundled code |

Narrow cross-cutting helpers go in `packages/utils` only after checking no domain package is a better owner. Specifically: resume JSON Patch behavior belongs in `@reactive-resume/resume/patch` and DOCX builders in `@reactive-resume/docx` — not in `@reactive-resume/utils`.

## Web app conventions

- `apps/web/src/router.tsx` initializes router context with `queryClient`, `orpc`, `theme`, `locale`, `session`, and `flags`. Reuse route context instead of refetching these ad hoc.
- The web app is a client-rendered SPA. `apps/server` serves `index.html` and injects page metadata (OpenGraph, canonical, JSON-LD) in `apps/server/src/static/web.ts`; there is no React SSR.
- Builder shell: `apps/web/src/routes/builder/$resumeId`. Public resume route: `apps/web/src/routes/$username/$slug.tsx`.
- Browser-only preview code: `apps/web/src/features/resume/preview`. Public PDF viewer: `apps/web/src/features/resume/public`. Keep PDF.js/canvas code in these features, not in `packages/pdf`.
- oRPC client: `apps/web/src/libs/orpc/client.ts` calls `/api/rpc` with credentials included. `apps/web/src/libs/orpc/fetch.ts` stages large request bodies through Blob on Vercel.
- For React components with explicit props, use a named props type (e.g. `type FooProps = {...}` with `function Foo(props: FooProps)`) rather than inline object annotations, especially with more than one field or with generics.

## Package boundaries

`pnpm exec turbo boundaries` is the executable check. Rules:

- Workspace deps go through package names and export maps. Never import another workspace's `src` tree via repo paths, `@reactive-resume/*/src/*`, or TS path aliases.
- Workspace `turbo.json` files declare coarse tags: `app:web`, `app:server`, `runtime:server` (server-only packages: API/auth/db/env/email/MCP), `runtime:browser` (browser-only shared UI), `runtime:universal` (environment-neutral domain packages), plus `role:domain|infra|adapter|api|rendering|tooling` for intent.
- Runtime-specific code lives behind explicit export subpaths (`@reactive-resume/pdf/browser`, `@reactive-resume/pdf/server`, `@reactive-resume/env/server`). Keep root exports environment-neutral unless the package is intentionally server-only.
- Wildcard exports are allowed only for leaf libraries with an intentionally file-like surface — currently `@reactive-resume/ui/components/*`, `@reactive-resume/ui/hooks/*`, and schema resume model files. Prefer explicit exports for packages owning runtime behavior.
- Prefer `protectedProcedure` from `packages/api/src/context.ts` for authenticated procedures. Expose only intentional public surfaces through `packages/api/package.json`.
- Shared PDF section filtering: `packages/pdf/src/templates/shared/filtering.ts`. Template-specific visual exceptions stay in the owning template directory unless multiple templates need the behavior. `packages/pdf/src/hooks/use-register-fonts.ts` owns font registration, standard PDF fonts, CJK fallback stacks, and global hyphenation.

Multi-place changes:

- **Resume data shape**: `packages/schema/src/resume/*` first, then API DTOs, importers, PDF rendering, and web forms consuming it.
- **New template**: `packages/schema/src/templates.ts`, `packages/pdf/src/templates/index.ts`, source under `packages/pdf/src/templates/<name>/`, and previews under `apps/web/public/templates/{jpg,pdf}`.
- **New DB column/table**: `packages/db/src/schema/*`, then `pnpm db:generate`.
- **New env var**: `packages/env/src/server.ts` **and** the `globalEnv` array in `turbo.json`. Turborepo 2.x strict env mode filters out unlisted vars, so the variable will be `undefined` in child processes at runtime even when correctly set in the OS/container environment.

## Environment and database

Copy `.env.example` to `.env.local`. Three required vars: `APP_URL` (default `http://localhost:3000`), `DATABASE_URL` (default `postgresql://postgres:postgres@localhost:5432/postgres`), `AUTH_SECRET` (any non-empty string).

- **S3/SeaweedFS optional.** If `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_BUCKET` are all set, the app uses S3-compatible storage. `.env.example` ships SeaweedFS defaults, so either start the `seaweedfs` compose service or comment those vars out to use local filesystem storage under `<workspace>/data`. `LOCAL_STORAGE_PATH` must be absolute when set.
- **`REDIS_URL` and `ENCRYPTION_SECRET`** are optional for core resume flows but both required for saved AI providers and the authenticated `/agent` workspace. Host-run dev uses `REDIS_URL=redis://localhost:6379`; the container-run app uses `redis://redis:6379`.
- **`drizzle-kit` (used by `pnpm db:migrate`) reads `DATABASE_URL` from `process.env` directly** — it does not auto-load `.env`. The root migration scripts load `.env.local` through `dotenvx` before invoking Drizzle Kit.
- The production server auto-runs migrations at startup before serving traffic, so manual `pnpm db:migrate` is mainly for first setup, migration debugging, or applying migrations without starting the app.

## Commands

Dev server and migration scripts load `.env.local` through the project-local `dotenvx`. Tests, typechecks, linters, boundary checks, and `pnpm build` do not load it automatically.

```
docker compose -f compose.dev.yml up -d postgres                                    # DB only
docker compose -f compose.dev.yml up -d postgres redis seaweedfs seaweedfs_create_bucket   # full infra
pnpm dev                                          # port 3000 (dev:web for web only)
pnpm db:generate                                  # db:migrate to apply
pnpm check                                       # Biome — WRITE-CAPABLE (--write --unsafe)
pnpm test | pnpm typecheck | pnpm build | pnpm exec turbo boundaries
```

Prefer package filters over repo-wide runs, e.g. `pnpm --filter web typecheck`, `pnpm --filter @reactive-resume/pdf test`. Vitest paths are package-relative under `pnpm --filter <package> test -- <path>`.

## Gotchas

- Email sending needs SMTP config; without it emails are logged to console. Dev still works — verification links appear in server logs.
- `lefthook.yml` pre-commit runs `biome check` on staged files. Run `pnpm check` before committing.
- `pnpm check` is write-capable. Call that out when using it, and use narrower Biome commands for a non-mutating inspection.
- Biome: tabs, double quotes, line width 120, organized import groups, sorted Tailwind classes for `clsx`, `cva`, `cn`.
- Most packages typecheck with `tsgo --noEmit` and test with `vitest run --passWithNoTests`.
- There may be unrelated local edits in the worktree. Check `git status --short` first; do not revert files you did not touch.

<!-- 上游工程规范结束 -->
