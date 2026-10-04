# 求职管理网站品牌整理与功能优化实施计划

> 执行者：先阅读根目录 `AGENTS.md`，按 executing-plans 分阶段执行。用户本次只要求保存计划，不代表授权开始开发、提交、推送或部署。复选框用于记录后续实施状态。

- 日期：2026-10-04
- 状态：Chunk 1（T0—T5 品牌清理与主入口整理）已于 2026-10-04 实施并本地验证（验收记录：`docs/acceptance/2026-10-04-product-branding.md`）；Chunk 2（F1—F6）未实施。未提交、未推送、未部署。
- 工作区：`D:\program\interview-manage`
- 本文件：`D:\program\interview-manage\docs\plans\2026-10-04-product-branding-and-optimization.md`
- 关联计划：`docs/plans/2026-10-02-ai-job-resume-management.md`
- 目标：让用户访问的是独立的求职管理产品，只看到与求职任务有关的内容，不再看到原项目品牌、作者推广、捐赠和开源社区宣传。
- 架构：继续复用现有简历编辑、模板、账号、岗位和导出能力；品牌整理不改变数据库结构，不重命名工作区包，不重写底座。
- 技术栈：React、TanStack Router、Hono、oRPC、Drizzle、PostgreSQL、pnpm、Turborepo。

## 一、范围与默认决策

### 1. 产品呈现

- 暂定产品名称为“求职管理”，只是可替换的实施默认值，不表示用户已确认正式商标或名称。
- 面向校招和社招求职者，中文优先。
- 首页只展示已可用的能力：岗位与投递记录、简历编辑、PDF/DOCX 导出，以及准确限定能力范围的 AI 辅助。
- 首批导航收敛为“岗位、简历、设置”；真实经历库完成后，再增加“我的经历”。不得先创建不可用入口。
- 求职信、ATS 检查保留在相关流程或次级工具入口；Agent、API Key 管理和集成保留在高级入口。这里的 API Key 管理指本产品对外 API 凭证，不应与模型服务商 Key 配置混淆。
- 不删除用户已有简历、岗位、求职信或历史数据；旧路由继续可访问。

### 2. 来源与许可边界

- 可清理面向用户的原品牌、作者介绍、GitHub 星标、社区统计、捐赠入口和原项目推广链接。
- 根目录 `LICENSE` 中的 MIT 许可及原作者版权声明原样保留；发布产物按现有许可要求携带必要声明。
- `AGENTS.md` 中的固定上游基线、内部维护文档和 Git 历史继续保留，便于追踪维护。不得虚称底层全部独立原创。
- 不做全仓字符串替换。`@reactive-resume/*` 包名、JSON 格式兼容逻辑及必要的第三方声明不是展示文案。
- 导入界面可将当前格式称为“简历备份（JSON）”、旧格式称为“旧版简历备份”；解析兼容能力不能随名称修改而失效。
- 隐私说明不能直接沿用另一网站的承诺；应准确说明本服务存储的数据、AI 调用的数据流和实际删除方式，不编造运营主体或联系方式。

### 3. 本轮不包含

- 不实现原 P1—P5 的全部功能；第二部分只负责确定衔接顺序，详细业务约束仍以原计划为准。
- 不新增付费、自动投递、招聘爬虫、机构后台或大规模架构改造。
- 不自动 Git push，不自动公网部署，不自动更换现有认证凭据或删除二次验证配置。

## 二、已确认现状与证据边界

本次依据源码、项目规范和现有计划检查；没有完成浏览器视觉审查、真实模型调用或新一轮运行验收。既有部署成功来自已有验收记录，本次没有重新验证线上状态。

| 优先级 | 现状 | 源码依据 | 用户影响 |
| --- | --- | --- | --- |
| 高 | 首页与页脚仍展示原品牌、开源介绍和社区链接 | `apps/web/src/features/homepage/page.tsx`、`site-footer.tsx` | 用户无法识别当前产品定位 |
| 高 | 非编辑器页面挂载五分钟后的捐赠提示 | `apps/web/src/routes/__root.tsx`、`apps/web/src/components/ui/donation-toast.tsx` | 打断任务并引导向原项目捐款 |
| 高 | 标题、搜索摘要、邮件和认证名称仍使用原品牌 | `apps/server/src/static/web.ts`、`apps/web/src/libs/seo.ts`、`packages/email/src/templates/auth.tsx`、`packages/auth/src/config.ts` | 仅改首页仍会留下身份混乱 |
| 高 | 岗位定制复制简历，但 AI 只重写简介 | `packages/api/src/features/applications/ai.ts` 的 `tailorResume` | 不能宣传为完整岗位简历定制 |
| 高 | 投递支持关联可编辑简历或上传文件，尚无计划中的统一冻结快照 | `packages/db/src/schema/applications.ts` | 仅关联工作简历不能保证重现投递时内容 |
| 中 | 主导航并列展示简历、投递、求职信、Agent、ATS 及多项设置 | `apps/web/src/routes/dashboard/-components/sidebar.tsx` | 首次使用缺少明确主线 |
| 中 | SEO 中仍有永久免费、绝不与第三方共享等原宣传 | `apps/server/src/static/web.ts`、`apps/web/src/libs/seo.ts` | 与实际运营和 AI 数据处理可能不一致 |

原开发计划记录 P0 已完成、P1—P5 待实施。执行前应再次核实代码，不能仅凭复选框判断功能存在或不存在。

## Chunk 1：品牌清理与主入口整理

依赖顺序：T0 → T1 → T2 → T3 → T4 → T5。此部分可单独交付，不依赖真实模型凭据或 P2 经历库。

：保护现有修改，建立实施基线

涉及文件：`AGENTS.md`、本计划、原开发计划，以及新增验收记录 `docs/acceptance/2026-10-04-product-branding.md`（实际执行跨日时使用执行日期）。

- [x] 运行 `git status --short`，记录已有修改，禁止覆盖其他人的工作。
- [x] 当前已有修改包括 `AGENTS.md`、原开发计划；部署验收记录和 `tooling/deployment/server/` 也是已有未提交文件。执行时重新核实。
- [x] 执行 `pnpm dlx @tanstack/intent@latest list`，按变更范围加载匹配技能。
- [x] 在 `AGENTS.md` 先补充产品展示规范：产品名集中管理、展示文案不得出现原推广内容、许可证保留、未实现功能不得宣传。
- [x] 记录首页、登录页、岗位页、简历页、编辑器和移动端的基线截图，只使用测试账号和合成材料。
- [x] 查清原首页组件与旧版 `_home/-sections` 的实际引用，防止改到未使用页面而漏掉真实入口。

验收：已有修改受保护，页面入口与引用清楚，新增文件遵循现有目录约定。

### T1：统一品牌文字、图标与页面身份

修改位置：

- `apps/web/index.html`
- `apps/web/public/manifest.webmanifest`
- `apps/web/public/favicon.svg`、`favicon.ico`、`apple-touch-icon-180x180.png`、`maskable-icon-512x512.png`
- `apps/web/public/icon/light.svg`、`dark.svg`；`apps/web/public/logo/light.svg`、`dark.svg`
- `apps/web/public/opengraph/` 下实际使用的分享图
- `packages/ui/src/components/brand-icon.tsx` 及其测试
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/routes/_home/index.tsx`、`_home/ats-checker.tsx`
- `apps/web/src/routes/$username/$slug.tsx`、`builder/$resumeId/route.tsx`
- `apps/web/src/libs/seo.ts`
- `apps/server/src/static/web.ts`、`seo.ts` 及对应测试

步骤：

- [x] 在现有环境无关包中建立品牌常量单一来源，优先检查 `packages/utils` 的导出规范；如新增，使用 `packages/utils/src/brand.ts` 和显式 `./brand` 导出。
- [x] 公共常量只包含产品名等静态信息；站点 URL 从当前 origin 或 `APP_URL` 获取，不能写死公网 IP 或原站地址。
- [x] 替换可见名称、辅助阅读标签、网站图标、安装应用名称和分享图，使用简洁自有图形，避免继续沿用原 logo。
- [x] 同步客户端、服务端及初始 HTML 的标题和摘要，避免页面加载前后出现不同品牌。
- [x] 清理 SEO 结构化数据、FAQ、robots/sitemap/llms.txt 中原站推广链接；保留本服务需要的抓取规则和私有页面 noindex。
- [x] 修订现有 SEO 测试，保留 canonical、转义、私有简历和根简历路由行为断言。

验收：普通页面、公开简历、分享摘要和安装入口均使用当前产品身份；无旧品牌闪现；简历访问控制不变。

### T2：重写首页，清理推广和捐赠

修改位置：

- `apps/web/src/features/homepage/page.tsx`、`site-footer.tsx`
- 同目录 `feature-explorer.tsx`、`export-playground.tsx`、`resume-sculpture.tsx`、`community-stats.tsx`
- `apps/web/src/routes/_home/-sections/header.tsx`、`footer.tsx` 及现有测试
- `apps/web/src/components/ui/copyright.tsx`、`donation-toast.tsx`
- `apps/web/src/components/input/github-stars-button.tsx` 及其引用
- `apps/web/src/routes/builder/$resumeId/-sidebar/right/sections/information.tsx`
- `apps/web/src/routes/__root.tsx`

步骤：

- [x] 首页改为简洁结构：产品名称与一句用途、核心操作入口、三项现有能力、使用步骤、简短页脚。
- [x] 推荐主文案：“把岗位、简历和投递进度放在一起。”主按钮“开始管理求职”，进入现有登录或工作区流程。
- [x] 移除原作者介绍、社区贡献、赞助商、星标、捐赠和原项目统计；不能把原项目用户量改称本站用户量。
- [x] 从根布局移除捐赠提示挂载；编辑器内的捐赠和推广入口一并处理。
- [x] 全局检查引用后删除无用推广组件和相应网络请求；仍被功能使用的组件不直接删除。
- [x] 首页不宣传截图导入、完整定制或经历溯源已经可用；保留 AI 文案时写明当前仅支持的操作及配置要求。
- [x] 原隐私/帮助外链改为符合本服务实际情况的内容或移除无效入口；不留下空链接和虚构客服。

验收：首页只服务当前产品；桌面与手机入口可见；停留超过五分钟没有捐赠提示；没有向原项目引流的按钮或请求。

### T3：收敛工作区入口与任务文案

修改位置：

- `apps/web/src/routes/dashboard/-components/sidebar.tsx`
- `apps/web/src/routes/dashboard/index.tsx`
- `apps/web/src/features/applications/components/application-form-sheet.tsx`、`application-detail-sheet.tsx`
- `apps/web/src/features/settings/pages/api-keys.tsx`
- `apps/web/src/dialogs/resume/import.tsx`（保留 `import.utils.ts` 的格式识别行为）
- `apps/web/src/features/resume/stylesheet/editor.tsx`

步骤：

- [x] 主导航改为“岗位、简历、设置”；保留求职信和 ATS 的次级入口，Agent 与技术集成进入高级入口。
- [x] 工作区默认进入岗位页；无岗位时提供“添加岗位”和“先准备简历”的明确引导，避免空白页。
- [x] “我的经历”在原 P2 完成并验收后再显示，不把账户资料页冒充经历库。
- [x] 将“关联 Reactive Resume”等表达改成“关联简历”；当前定制操作准确称为“生成岗位简介副本”等不夸大能力的文案。
- [x] 保留旧 URL、收藏链接和数据访问路径；导航隐藏不等于删除接口或授权检查。
- [x] 自定义样式帮助、API 帮助等入口逐项处理，移除后要留下足够的本地说明，不能让功能失去使用指引。

验收：添加岗位 → 关联简历 → 编辑 → 导出 → 更新投递状态可完成；无 Key 用户仍能手动操作；旧入口可访问。

### T4：邮件、认证与翻译一致性

修改位置：

- `packages/email/src/templates/auth.tsx`、`packages/email/src/transport.ts`
- `packages/auth/src/config.ts`
- `apps/web/src/dialogs/auth/enable-two-factor.tsx`
- `apps/web/lingui.config.ts` 对应的现有语言目录（执行前从配置解析实际位置）

步骤：

- [x] 邮件名称和页脚替换为当前品牌，去掉作者推广；图标改用本服务可达资源，必要时使用纯文字标题。
- [x] 保持用户配置的 `SMTP_FROM` 优先，不能写入未经验证的发件域名。
- [x] 修改认证显示名称；新增二次验证的 issuer 前后端一致，保留已绑定用户的密钥和验证能力。
- [x] 提取并更新实际使用的中文翻译，检查旧翻译是否重新带回原品牌；不机械修改所有外部格式名称。
- [x] 用测试邮箱模板或本地预览检查验证、重置密码等邮件；无真实 SMTP 时明确“模板已验证，实际投递未验证”。

验收：登录、邮件、二次验证和网站名称一致；已有二次验证账号仍可登录；认证回调和重置链接 origin 正确。

### T5：项目说明与回归交付

修改位置：`README.md`、原开发计划、本计划及 T0 的验收记录。

- [x] README 改为当前产品说明：已实现功能、运行方式、配置、数据目录和部署说明入口；去除原项目宣传、徽章和捐赠段落。
- [x] 保留 `LICENSE`，原计划中的基线和内部来源信息不清除；不重命名包和迁移。
- [x] 产品品牌信息集中维护；对反复出现的推广残留检查增加可复用检查，优先复用既有测试体系，不为纯文字替换新建大套测试。
- [x] 按下方验证矩阵运行检查，修复因入口和品牌变化导致的合理失败，不能只删除原行为测试来通过。
- [x] 验收记录分别填写自动化、浏览器、Mock、真实邮件、真实模型和线上验证结果。
- [x] 同步原开发计划的前置完成状态，不把品牌整理完成等同于 P1—P5 完成。

## Chunk 2：后续功能优化衔接

本部分是后续业务开发顺序，不与品牌整理捆绑交付；执行时使用原计划的详细约束，并另拆小任务。下列路径为现有落点或明确标注的拟新增位置，不代表功能已存在。

| 顺序 | 工作内容 | 实施落点 | 验收关键点 |
| --- | --- | --- | --- |
| F1 | 原 P1：邀请入口、模型配置和能力探测 | `packages/auth`、`packages/api/src/features/ai-providers/`、`features/ai/`、Web 设置 | 两账号隔离；文字与图片能力分开；输入不因错误丢失；先复核已有 URL 安全策略，避免重复实现 |
| F2 | 原 P2：真实经历库与确认版本 | 拟新增 `packages/db/src/schema/profile.ts`、`packages/api/src/features/profile/`、`apps/web/src/features/profile/` | 用户确认后形成事实版本，AI 不回写；旧版本可追溯 |
| F3 | 原 P3：岗位文字与截图导入 | `packages/api/src/features/applications/`、`apps/web/src/features/applications/`，后台任务按原计划落位 | 视觉识别/OCR 兜底、原文保留、缺失字段不编造、确认后保存 |
| F4 | 原 P4：完整岗位简历定制 | 拟新增 `packages/api/src/features/tailoring/`，复用现有编辑器与 schema | 事实与版本绑定、受保护字段校验、差异确认、过期拒绝、幂等接受 |
| F5 | 原 P5：投递快照与跟进 | `packages/db/src/schema/applications.ts`、`packages/api/src/features/applications/` | 冻结数据与文件一致；后续修改或删除工作简历不改变历史投递 |
| F6 | 原 P5：部署、备份与恢复 | `tooling/deployment/`、`tooling/deployment/server/`、`docs/acceptance/` | 数据库、文件与密钥恢复演练；真实样本及真实模型验收 |

- [ ] 新增目录前补齐归属、命名和清理约定；新增表后走 `pnpm db:generate`，不手写绕过迁移生成流程。
- [ ] 每阶段满足原计划验收标准后，再更新首页宣传与导航。
- [ ] F4 完成后退出旧的“只改简介”主入口，保持兼容处理，避免两种定制入口混淆。
- [ ] 优化效果以导入、生成、接受、导出成功率和任务耗时衡量；日志不保存明文 Key 或简历正文。

## 三、验证命令与验收矩阵

### 环境准备

在仓库根目录执行，Node 使用 24.9.0+，pnpm 使用项目固定版本。本机 PowerShell 包装器如因内置模块损坏失败，可使用 `pnpm.cmd` 执行相同参数；不能把退出码为零但打印异常视作成功。

```text
git status --short
node --version
pnpm --version
pnpm dlx @tanstack/intent@latest list
```

单测前按 `AGENTS.md` 临时隔离根 `.env`，必须用异常也能恢复的方式；不得覆盖 `.env.local`，不得打印凭据。E2E 使用合成数据及专用测试数据库，服务端开启 `FLAG_DISABLE_API_RATE_LIMIT=true`，测试进程的 `DATABASE_URL` 通过安全环境注入。

### 检查顺序

先运行所改模块的定向测试，再进行阶段终验。以下是计划命令，本次编写文档未执行这些业务检查。

```text
pnpm --filter web test
pnpm --filter server test
pnpm --filter @reactive-resume/email test
pnpm --filter @reactive-resume/auth test
pnpm typecheck
pnpm exec turbo boundaries
pnpm test
pnpm build
pnpm exec playwright test --workers=2
git diff --check
```

- 只读格式检查用 `pnpm exec biome check <实际修改的代码文件列表>`；不要用会写文件的 `pnpm check` 代替只读检查。
- 预期：定向测试、全量测试、类型、边界、构建与 E2E 通过；如有既有失败，记录复现依据及与本次变更的关系。
- 涉及品牌图标或导出行为的修改，应补跑对应包的测试；不新增只断言同一个字符串常量的无效测试。
- Markdown 文档检查使用 `pnpm exec markdownlint-cli2 docs/plans/2026-10-04-product-branding-and-optimization.md`，不加修复参数。

### 浏览器与交付验收

- [x] 桌面 1440px 与手机 390px 宽度检查首页、登录、岗位、简历、设置和编辑器，无溢出、遮挡、空链接。（2026-10-04 执行，截图见 `artifacts/baseline/`、`artifacts/after/`）
- [ ] 键盘操作、按钮名称、表单标签和移动端主入口可用；默认中文文案自然。（部分完成：关键入口可访问名称有自动化断言，默认中文已生效；完整键盘走查未执行）
- [x] 等待超过五分钟无捐赠提示；自动化测试可控制计时器，真实浏览器检查结果单独记录。（组件已整体移除，超 20 分钟会话截图无提示）
- [x] 检查初始 HTML 与加载后的标题、描述、分享元信息、favicon、manifest 和邮件模板，没有原品牌推广残留。
- [x] 对源码残留逐项分类：展示残留必须修复；包名、兼容标识和许可允许保留。禁止以“全仓零匹配”为验收目标。（分类见验收记录第三节）
- [ ] 新建合成简历，编辑保存并导出 PDF/DOCX，人工打开核对中文内容和布局；公开分享及受限访问仍正常。（导出链路与 DOCX 中文内容已自动验证，PDF 人工目检待复核）
- [x] 新建岗位、关联简历、修改状态；无模型 Key 仍能手动操作；旧链接仍可访问。（e2e applications-tracker 等覆盖）
- [x] 未发生未授权数据删除，`LICENSE` 保留，业务数据与凭据未进入 Git。

## 四、部署与回滚

- 品牌整理本地验收完成后交付结果；只有用户明确要求上线，才执行项目部署流程。
- 部署前阅读 `docs/acceptance/2026-10-04-server-deployment.md`，使用 `tooling/deployment/server/` 实际配置，不把示例命令当已执行结果。
- 保存现有镜像标识与配置备份；需要迁移的后续功能必须先备份数据库、持久文件和解密所需配置。
- 当前入口记录为 `http://8.148.199.165:3012`，只作为既有部署信息；本次未重新探测可用性。
- 服务器自测使用 `127.0.0.1:3012`，冒烟时 `APP_URL` 与 `SMOKE_URL` origin 一致；遵守服务器无公网出口及代理约定。
- 品牌阶段不改表，可按原部署方式回退镜像；涉及 F2—F5 时，另行验证数据库与旧镜像兼容性，不能仅凭镜像回退宣称恢复。

## 五、交付物与当前交接状态

实施完成后交付：

1. 品牌统一、主入口收敛的网站代码与资源。
2. 更新后的 `README.md`、`AGENTS.md` 和计划状态。
3. `docs/acceptance/` 下的脱敏验收记录，包括检查命令、结果、截图位置和剩余缺口。
4. 原始许可证与必要声明；可恢复的部署说明。

当前状态：

- 已完成：源码层面的品牌残留和功能差距初查；本 Markdown 计划编写。
- 尚未实施：T0—T5、F1—F6。
- 尚未验证：本轮浏览器表现、测试、构建、真实邮件、真实模型、线上改版。
- 下一位执行者从 T0 开始；保留工作区已有修改，遵循原计划的数据真实性和隐私边界。
- 本次仅新增计划文件，不修改业务代码，不提交、不推送、不部署。
