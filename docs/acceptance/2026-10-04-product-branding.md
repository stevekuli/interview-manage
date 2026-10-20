# 品牌整理与主入口收敛验收记录

- 日期：2026-10-04
- 关联计划：`docs/plans/2026-10-04-product-branding-and-optimization.md`（Chunk 1：T0—T5）
- 工作区：`D:\program\interview-manage`
- 执行环境：Node 24.9.0、pnpm 12.6.0、本机 Docker（postgres :5433 / redis :6379）
- 测试账号：本轮注册合成账号 `brandtest@example.com`（本地开发库，含一份合成简历 "Sample Backend Engineer"）；所有截图与导出仅使用合成材料。

## 一、实施内容摘要

- 品牌单一来源：新增 `packages/utils/src/brand.ts`（`./brand` 导出，APP_NAME="求职管理"），web、server、auth、email、mcp、ui 各处展示文案改从其读取。
- 图标与安装身份：`tooling/brand/generate-brand-assets.mjs` 生成了全新的公文包+对勾图标（favicon.svg/ico、pwa、maskable、apple-touch、icon/logo 明暗变体）及 opengraph 分享图（banner.jpg、ats-checker.png）；manifest 改为中文应用名并移除上游品牌截图。
- 页面身份：`index.html`、`__root.tsx`、`_home/index.tsx`、`ats-checker.tsx`、公开简历路由、builder 路由、服务端 `static/web.ts`、`static/seo.ts`（robots/sitemap/llms.txt）、OpenAPI 元信息、MCP server card 的标题/描述/结构化数据全部换新；移除上游文档站与仓库推广链接。
- 首页重写：仅保留产品名+一句用途、核心入口（"开始管理求职"）、三项现有能力、准确的 AI 辅助说明（需自配模型服务）、使用步骤、简短页脚；删除简历雕塑、社区统计、模板货架、语言橱窗、导出/ATS 演练场、GitHub 星标按钮、捐赠板块等推广组件及其网络请求。
- 捐赠清理：`DonationToast` 组件及其在根布局的挂载、编辑器内的捐赠信息区块（改为本地编辑提示）、`funding.json`、页脚/邮件中的作者署名全部移除。
- 工作区入口：主导航收敛为 求职（岗位、简历）/ 工具（求职信、ATS 检查）/ 设置（资料、偏好、身份验证、账户）/ 高级（Agent、API Keys、集成）；`/dashboard/` 默认重定向到岗位页；导入界面格式名改为"简历备份（JSON）/旧版简历备份（JSON）"；"关联 Reactive Resume"改为"关联简历"；AI 定制文案改为"生成岗位定制副本（仅重写简介）"。
- 邮件与认证：邮件模板改用纯文字品牌头并移除作者署名（真实渲染验证通过）；认证 appName 与二次验证 issuer 换新（前后端一致，已绑定密钥不受影响）；备份码文件名更新。
- i18n：默认语言改为中文优先（cookie > 浏览器语言 > zh-CN 回退）；zh-CN 目录完成缺失翻译 74 条并清理旧品牌翻译；新增"申请/岗位/投递"语境一致性修正。
- 交付物：README 重写为本产品说明；`AGENTS.md` 新增"产品展示与品牌规范"和 e2e IPv4 约定；新增可复用残留检查 `apps/web/src/brand-promo-remnants.test.ts`；`docs/spec.json` 重新生成。

## 二、自动化验证矩阵（真实执行结果）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 定向单测（逐阶段） | `pnpm --filter … test / vitest run …` | ui 352✓、mcp 66✓、web seo/locale/loading 等 ✓、server static+openapi 43✓、email 6✓、auth 28✓、web applications/settings/dialogs 149✓ |
| web 全量单测 | `pnpm --filter web test` | 132 文件 / 933 测试全过 |
| 全仓单测 | `pnpm test`（隐藏根 `.env`） | 除下述已知环境抖动外全绿；并行下 auth `config-lifecycle` 超时（P0 基线已记录的本机资源竞争，隔离 28/28 过）；串行跑 pdf 包瞬时 fetch 失败（隔离 42/42 过） |
| 只读格式检查 | `pnpm exec biome check <改动文件>` | 通过（59 文件，0 错误） |
| 类型检查 | `pnpm typecheck` | 19/19 通过 |
| 包边界 | `pnpm exec turbo boundaries` | 1114 文件，无问题 |
| 构建 | `pnpm build` | 3/3 通过（exit 0） |
| E2E | `DATABASE_URL=… FLAG_DISABLE_API_RATE_LIMIT=true pnpm exec playwright test --workers=2 --reporter=line` | 27 通过 / 2 失败 / 7 跳过；2 个失败（cover-letter-library、lock-resume）隔离复跑全过，与本机并行资源抖动特征一致（同 P0 基线记录；未逐例复现定位） |
| E2E 修复说明 | — | 因默认落地页改为岗位页，修正 `auth.spec.ts` 落地断言（行为变更适配，非删除测试）；语言默认值变化通过浏览器语言检测兼容（e2e 的 Playwright 默认 en-US 不受影响） |
| 服务端注入检查 | `curl` `/`、`/llms.txt`、`/robots.txt`、`/sitemap.xml` | 标题/描述/链接均为本产品身份，无原站引用 |
| 邮件模板真实渲染 | tsx 渲染 `VerifyEmail` | 含"求职管理"，不含 Reactive Resume/Amruth/rxresu.me |
| Markdown 检查 | `pnpm exec markdownlint-cli2 <计划文件>` | 当轮未执行（当时误记为"无 markdownlint 依赖配置"；实际 `markdownlint-cli2@0.23.3` 与 `.markdownlint-cli2.yaml` 均已在仓）。2026-10-05 补跑：118 个 md/mdx 仅 1 处问题（CLAUDE.md 缺尾换行），当日已修复复跑通过 |
| 行尾检查 | `git diff --check` | 通过（AGENTS.md 已规范化为 LF） |

> E2E 环境注意（已同步 AGENTS.md）：服务端 PDF 渲染外联 fonts.gstatic.com，本机直连下 Node fetch 需 `NODE_OPTIONS=--dns-result-order=ipv4first`，否则 IPv6 优先导致超时。

## 三、浏览器与交付验收

截图（全部合成数据，1440px 与 390px）：

- 基线（改版前）：`artifacts/baseline/`（home-1440、home-390、login、dashboard-resumes、dashboard-applications、builder、settings-profile）
- 改版后：`artifacts/after/`（home-1440、home-390、login-1440、dashboard-1440、applications-1440、applications-390、resumes-390、settings-390、builder-390、export-sample.pdf、export-sample.docx）

结果：

- [x] 桌面 1440px：首页、登录、岗位、简历、设置、编辑器无溢出/遮挡/空链接；移动 390px：首页、岗位、简历、设置、编辑器主入口可用。
- [x] 默认中文文案自然（zh-CN 优先生效，浏览器语言自动检测，英文环境回退英文）。
- [x] 停留超过五分钟无捐赠提示：`DonationToast` 已从根布局移除且组件删除；登录态会话超 20 分钟的截图无任何 toast。
- [x] 初始 HTML、标题/描述/分享元信息、favicon、manifest、邮件模板无原品牌残留（curl + 截图 + 渲染验证）。
- [x] 源码残留逐项分类（见下节），未以"全仓零匹配"为目标。
- [x] 合成简历导出 PDF（%PDF 魔数）与 DOCX（PK 魔数，`word/document.xml` 含"张测试"）；公开分享与受限访问行为由 e2e（sharing-password、public-sharing 等）覆盖。
- [x] 登录后默认进入岗位页；空状态提供"添加岗位"引导与关联简历说明；无模型 Key 时手动操作不受影响（copilot 按钮 disabled 逻辑未改动）；旧 URL（/dashboard/resumes、/dashboard/cover-letters、/agent、/ats-checker）全部保留可访问。
- [x] 未发生未授权数据删除；`LICENSE` 原样保留；无业务数据与凭据进入 Git。

### 源码残留分类（展示=必须修复 / 兼容=允许保留）

- 已修复（展示面）：web/server 全部页面与元数据、邮件、认证、MCP 卡片、OpenAPI 元信息、图标/分享图、manifest、README、zh-CN 目录。
- 允许保留（兼容/许可/内部）：`@reactive-resume/*` 包名；`import.utils.ts` 中的 JSON 格式识别注释；`docs/spec.json` 与 OpenAPI 中的 MIT 许可链接（许可声明要求）；`packages/resume/src/patch.ts` 内部 API 文档注释；Git 历史与内部计划文档中的上游基线记录。

## 四、缺口与未验证项

1. **真实 SMTP 投递未验证**：邮件仅做模板渲染验证（"模板已验证，实际投递未验证"）；`SMTP_FROM` 优先逻辑未改动。
2. **真实模型调用未验证**：本轮无 AI 功能改动；AI 文案仅按现有实现（匹配评分/定制副本/求职信/跟进草拟）如实收敛。
3. **线上状态未重新验证**：本次未重新探测 `http://8.148.199.165:3012`；品牌改版未部署（按计划等待用户明确要求上线）。2026-10-05 更新：品牌版本已于当日部署公网并冒烟通过，生产现运行 `interview-manage:20261005`（见 `docs/acceptance/2026-10-05-branding-deployment.md`）。部署后回滚方式：本阶段不改表结构，可直接回退镜像。
4. **PDF 中文版式人工目检**：导出链路已自动验证（格式签名+DOCX 内容断言），PDF 视觉排版请人工打开 `artifacts/after/export-sample.pdf` 复核。
5. **完整键盘走查未执行**：关键入口的可访问名称已在组件测试与 aria 快照中断言，但未做逐页键盘遍历。
6. **markdownlint 检查当轮未执行**：依赖与仓库配置（`markdownlint-cli2@0.23.3`、`.markdownlint-cli2.yaml`）实际存在，当轮误记为缺失；2026-10-05 已补跑并修复唯一问题（见第二节矩阵）。
7. **测试账号清理**：本地开发库新增 `brandtest@example.com` 合成账号及一份合成简历，未删除（本机数据，不影响交付）。

## 五、遗留环境抖动备忘（非本次引入）

- 全量并行单测下 auth `config-lifecycle` 超时：P0 基线同款记录，已将该文件超时提升至 20s，极端负载仍可能触发；隔离运行稳定。
- E2E 并行下个别用例（lock-resume、cover-letter-library、sharing-password 等）资源饿死超时：隔离复跑全过；与 P0 基线"高并行偶发资源饿死"记录一致。
