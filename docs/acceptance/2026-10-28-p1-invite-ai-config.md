# 2026-10-28 P1 多用户内测入口与 AI 配置——实施与验收记录

- 对应计划：`docs/plans/2026-10-02-ai-job-resume-management.md` P1；入口批次见 `docs/plans/2026-10-28-mcp-integrations-and-next-phases.md` S4。
- 交付 commit：`53f5e4d`（邀请机制）、`ced4091`（视觉探测 + SSRF 强化 + 余额分类 + 导航收敛）、`a223bf7`（hook 路径匹配与释放修复）。
- 本记录只覆盖 P1 范围；S1—S3 的部署与 MCP 验收见 `2026-10-28-mcp-integrations-deployment.md`。

## 一、一次性邀请机制（全新，真实验证通过）

- **表**：`invitation`（code 唯一、note、createdBy、expiresAt、usedAt、usedBy、revokedAt；迁移 `20261028115916_typical_pyro`）。
- **注册校验**：Better Auth `hooks.before` 拦截 `/sign-up/email`（按路径后缀匹配）——无码/错码/过期/已用/已撤销均 400；原子 `UPDATE ... WHERE unused AND unexpired AND unrevoked RETURNING` 保证同码并发只有一人成功。`hooks.after` 按 `context.returned instanceof APIError` 判定：注册失败（如重复邮箱 422）**释放码**，成功则落 `usedBy=email`。
- **开关**：`FLAG_INVITATION_ONLY`（默认 false）。开启时 email 注册需邀请码；四家 OAuth 的 `disableSignUp` 同时拒绝**新**用户（既有用户登录不受影响）。
- **CLI**：`pnpm --filter @reactive-resume/tooling invitations -- generate|list|revoke`（`tooling/invitations/cli.ts`，照 `database/reset.ts` 的 env/pg 模式）。
- **前端**：`/flags` 暴露 `invitationOnly`；注册页据此渲染必填「邀请码」输入（XXXX-XXXX 校验、自动大写）；zh-CN 文案「邀请码」。
- **真实 DB 集成验证**（本地 PG 5433 + 完整 Better Auth handler 链，脚本 `artifacts/invitation-e2e.mts`）：**ALL 10 CHECKS PASSED**——无码 400、错码 400、正码 200 且消耗+usedBy、复用 400、重复邮箱 422 且新码被释放（首码保持消耗）、撤销码 400。
- 单测：`packages/auth/src/invitations.test.ts`（码格式/唯一性/防混淆字母表）。

实施中发现并修复的问题（`a223bf7`）：hook 初版用 `ctx.path === "/sign-up/email"` 严格匹配，而 `ctx.path` 实际为 `/api/auth/sign-up/email`，导致 hook 完全不生效（集成验证抓出）；after 初版读 `ctx.response`（不存在）导致成功注册也释放码。**结论：两条 hook 行为均以真实 handler 链验证为准，不以类型推断为准。**

## 二、AI Provider 文字/视觉能力分别探测

- `testVisionConnection()`（`packages/api/src/features/ai/service.ts`）：文字探测成功后，用 1x1 PNG 独立探测图片输入；结果三态 `supported/unsupported/failed`（4xx 视为不支持，5xx/网络视为探测失败）。落库 `vision_test_status/vision_test_error`（迁移 `20261028120458_uneven_proudstar`），修改 model/key/baseURL 后随 `runtimeChanged` 一并重置为 `untested`。
- 前端 `ProviderRow` 新增徽章：「Vision」/「Text only」，`visionTestError` 灰字提示。
- **验收缺口（真实模型）**：DeepSeek 文字模型与一个视觉接口的端到端探测需真实 API Key，本轮未获得，未用 Mock 冒充；待 Key 注入后在线上设置页重测即可（Save & Test 自动跑双探测）。

## 三、错误分类补充

`describeTestConnectionFailure` 新增：HTTP 402 与 429 中的 quota/balance/credit/arrears/insufficient 消息 → 「余额或配额已用尽」可操作提示，与纯限流（429 其他）区分；错误消息透传分支保持 API Key 脱敏。单测覆盖三分类与脱敏（`service.test.ts`）。

## 四、自定义模型地址 SSRF 强化

- **DNS 解析校验**：`hostnameResolvesToPrivateAddress()`（utils，`dns.lookup all` 逐 IP 比对保留网段）——堵住 `evil.com → 127.0.0.1` 的字面量绕过；解析失败不拦截（连接时自然失败）。
- **重定向与实际连接目标**：`createSsrfGuardedFetch()`——`redirect: "manual"` 手动逐跳跟随（上限 5 跳），每一跳重新做「URL 字面量 + DNS 解析」双校验；303/301/302-POST 规范转 GET 且剥离请求体（修复了 `...init` 展开会把 body 带回 GET 的真实 bug，单测抓出）。仅对配置了自定义 `baseURL` 的 provider 注入（官方内置端点不受影响）；`FLAG_ALLOW_UNSAFE_AI_BASE_URL` 逃生开关语义不变。
- 单测 8 例（`url-policy.test.ts`）：直通、安全重定向+相对路径、环回/私网重定向拒绝、DNS 私有解析拒绝、转 GET 剥 body、跳数上限、unsafe 放行。
- **已知边界**（代码注释已注明）：DNS rebinding TOCTOU（校验与连接间解析结果可变）未完全闭合，需连接层固定 IP，超出本轮范围；开发者本机 fake-ip 代理（198.18.0.0/15）会令单测 DNS 校验全数拒绝，测试中已 mock 隔离——线上容器实测无此问题（冒烟 PDF 走真实外联成功）。

## 五、主导航收敛

侧边栏主组收敛为「岗位（Applications）、简历（Resumes）、设置（Settings → preferences）」；「我的经历」按主计划 P2 交付后加入。既有直达入口（Cover Letters/ATS/Profile/Agents/API Keys/AI Models）全部保留，未砍功能。

## 六、验证汇总

| 验证 | 方式 | 结果 |
| :--- | :--- | :--- |
| 邀请机制 10 场景 | 本地 PG + 真实 Better Auth handler 链 | ALL PASSED |
| auth / api 单测 | vitest（`.env` 移走后运行） | 34 + 32 全过 |
| 全仓 typecheck | 19 任务 | 全过 |
| turbo boundaries | 1123 文件 | 无违规 |
| web 生产构建 | vite build | 成功 |
| Biome（改动文件） | check | 干净 |
| 视觉探测（真实模型） | 未获得真实 Key | **缺口，待用户提供 Key 后线上复测** |
| 两用户隔离 | 沿用既有 protectedProcedure + e2e 跨账号断言 | 未新增用例（P1 收尾可补） |

## 七、遗留与下一步

1. 真实 DeepSeek + 视觉模型 Key 注入后的线上双探测验收（缺口）。
2. 「返回设置后保留原任务输入」的 agent 工作台交互（P1 checkbox 尾项，随 agent 面板迭代落地）。
3. P1 交付物上线路径：下一轮部署时在服务器 `.env` 开启 `FLAG_INVITATION_ONLY` 并用 CLI 生成首批邀请码（含 `migrations/` 两个新迁移，**不再是纯 dist 增量补丁**，需整镜像或含迁移的补丁流程）。
