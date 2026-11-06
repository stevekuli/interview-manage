# 2026-11-05 Anthropic 兼容自定义提供商上线验收记录

- 对应改动：新增 `anthropic-compatible` 提供商（自定义 Anthropic 兼容端点），`openai-compatible` 前端展示名改为「自定义 (OpenAI 兼容)」；连带上线 P1（邀请制注册 + AI 视觉探测 + SSRF 加固）。
- 部署目标：`https://interview.unlimit.ltd`
- 结论：**部署成功，线上验证全部通过**。

## 改动内容（本地 4 文件，未新增 npm 依赖）

| 文件 | 改动 |
| :--- | :--- |
| `packages/ai/src/types.ts` | `AI_PROVIDERS` 新增 `anthropic-compatible`（默认 baseUrl 空串强制填写；display name 通用名） |
| `packages/api/src/features/ai/service.ts` | `getModel()` 新增 `createAnthropic` 分支；自定义 baseUrl 自动走 SSRF guarded fetch |
| `apps/web/.../ai-section.tsx` | 下拉新增「自定义 (Anthropic 兼容)」；`openai-compatible` 改名「自定义 (OpenAI 兼容)」，keywords 含中文 |
| `apps/web/.../ai-section.test.tsx` | 补充两个自定义选项断言 |

DB 无 schema 变更（`ai_providers.provider` 为 text 列）。

## 本地验证（Node v24.9.0，`.env` 临时移走后跑测试、已恢复）

- typecheck：`@reactive-resume/ai` / `@reactive-resume/api` / `web` 全过。
- `@reactive-resume/api` 测试：460 passed / 7 skipped；`ai-section.test.tsx`：4 passed。
- `pnpm exec turbo boundaries`：1123 文件无违规；改动文件 Biome 只读检查无问题。
- web 全量测试存在 **2 个存量失败**（`application-form-sheet.test.tsx` AI 自动填充两用例），经 stash 基线对比确认与本次改动无关（改动前同样失败），未修复、保留记录。

## 增量补丁部署（2026-11-05）

- 部署范围决策：服务器原运行 `20261028`（基于 `08e4348`）；其后本地有 P1 三个代码提交未部署。经用户确认**连带上线 P1**（新用户注册需邀请码）。
- 增量前提核对：`pnpm-lock.yaml` 变更仅 `tooling/` 工作区 workspace 链接，不影响生产 apps 依赖树；**`migrations/` 有 2 个新迁移**（`20261028115916`、`20261028120458`，invitations 相关），已纳入补丁一并覆盖镜像 `/app/migrations`。
- 补丁：`dist-patch-20261105.tar.gz`（apps/web/dist + apps/server/dist + migrations，15,030,940 字节），scp 直传一次成功，双端 sha256 一致 `e3ed85dcb5e452f7041b5cfdbad1be0a7220187b40ac34273b15f0b7286bff3d`。
- 镜像：`docker create`（基于 `20261028`）→ `docker cp` apps+migrations → `docker commit` → **`interview-manage:20261105`**（1.79GB，`b5d4e4a4ad27`）；旧镜像 20261028/20261005/20261004 保留为回滚点。
- compose.yml（本地副本已同步提交）：tag 切 `20261105`；**NO_PROXY 追加 `open.bigmodel.cn`**（智谱直连，mihomo 上游订阅仍 405 失效）；**environment 新增 `FLAG_INVITATION_ONLY=${FLAG_INVITATION_ONLY:-false}`**（见下文"事故与处置"）。服务器旧配置备份 `compose.yml.bak-20261105`（初版）与 `.env.bak-20261105`。
- 启动日志 `Running database migrations... Database migrations completed`；`drizzle.__drizzle_migrations` 最新记录与本次迁移对应；`invitation` 表已创建。

## 线上验收（全部真实验证）

| 检查项 | 结果 |
| :--- | :--- |
| `https://interview.unlimit.ltd/api/health` | HTTP 200，容器 healthy |
| 首页 | HTTP 200 |
| 前端产物含新选项 | 容器内 `route-CO_Yxto-.js` 命中「Anthropic 兼容」 |
| 邀请制生效 | 无邀请码 POST `/api/auth/sign-up/email`（含 username）→ `"An invitation code is required to sign up."`（被拒，无用户残留，count 0） |
| **容器直连智谱 Anthropic 端点** | POST `https://open.bigmodel.cn/api/anthropic/v1/messages`（无效 key）→ **HTTP 401「令牌已过期或验证不正确」**：NO_PROXY 直连生效、端点可达、`x-api-key` 头被智谱接受 |

## 事故与处置：邀请制开关未随容器注入（部署时遗漏）

1. **现象**：首次无邀请码注册测试返回 `FAILED_TO_CREATE_USER` 而非邀请码错误。
2. **根因**：两层——① 本次部署时未把 `FLAG_INVITATION_ONLY=true` 写入服务器 `.env`（P1 上线前提，见 P1 验收记录），邀请制默认关闭；② 补写 `.env` 后 `docker compose up -d app` 判断容器配置未变**没有重建**，且 compose `environment` 列表本就未声明该变量，`.env` 值根本不会进入容器进程。
3. **另注**：首次测试请求体未带 `username` 字段（`user` 表该列 NOT NULL），即使无邀请制也会 DB insert 失败——`FAILED_TO_CREATE_USER` 是测试姿势所致，非代码回归；补传 `username` 后复测确认。
4. **修复**：compose.yml app `environment` 增加 `FLAG_INVITATION_ONLY=${FLAG_INVITATION_ONLY:-false}`（本地副本已同步）→ 上传 → 服务器 `.env` 追加 `FLAG_INVITATION_ONLY=true`（备份 `.env.bak-20261105`）→ 容器重建。`printenv` 确认容器内值为 `true`。
5. **复验**：无邀请码注册（含 username）被邀请 hook 明确拒绝 `"An invitation code is required to sign up."`；health 200；无用户残留。

## 验收缺口（需用户操作）

1. **真实智谱密钥的端到端测试未做**（需要用户在 UI 操作）：编辑现有「GLM-5.3-Flash」记录 → 提供商改「自定义 (Anthropic 兼容)」→ Base URL `https://open.bigmodel.cn/api/anthropic` → 模型改智谱真实模型名（如 `glm-4.6`，原配置 `gpt-4.1` 无效）→ 测试。备选：「自定义 (OpenAI 兼容)」+ `https://open.bigmodel.cn/api/paas/v4`。
2. **有效邀请码注册全流程未验证**（需用户生成邀请码后真实注册一次）。

## 回滚方式

- `/opt/interview-manage/compose.yml` app tag 改回 `interview-manage:20261028` + `docker compose up -d app`（备份 `compose.yml.bak-20261105`）。
- 迁移回滚：2 个新迁移为新增表/列，未删改旧结构；回滚镜像后旧代码不依赖新表，可保留不回滚。

## 临时文件清理

- 已删：本机与服务器补丁包、服务器 `/tmp/patch-20261105`、`/tmp/compose.yml.new`。
- 保留：服务器 `compose.yml.bak-20261105`（回滚备份）、`smoke.mjs`。
