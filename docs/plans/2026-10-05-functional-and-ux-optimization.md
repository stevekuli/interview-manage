# 求职管理功能与交互优化实施计划

> 执行者先阅读根目录 `AGENTS.md`，使用 executing-plans 按阶段推进。用户于 2026-10-05 授权执行本计划；按项目规范未自动提交、推送或部署。

- 日期：2026-10-05
- 状态：T0—T12 已于 2026-10-05 实施，本地验证通过（验收记录：`docs/acceptance/2026-10-05-functional-and-ux-optimization.md`）。登录态人工走查、真实模型调用、390px 真机截图与中文导出人工目检仍为缺口。未提交、未推送、未部署。
- 工作区：`D:\program\interview-manage`
- 复查依据：`docs/acceptance/2026-10-05-product-ux-review.md`
- 品牌计划：`docs/plans/2026-10-04-product-branding-and-optimization.md`
- 业务总计划：`docs/plans/2026-10-02-ai-job-resume-management.md`
- 目标：让“添加岗位 → 准备简历 → 定制与导出 → 跟踪投递”更可靠、更容易完成。
- 实现原则：沿用现有 React、TanStack Router、oRPC、Drizzle 与简历编辑器；先修基础流程，再改善交互，最后衔接完整 AI 功能。

## 一、范围与验证边界

本计划包含复查报告中的 R1—R7 和 U1—U5。优先解决无 Key 录入、请求失败、异步覆盖、过期评分、配置引导、表单可访问性及中文一致性。

已有证据是当前源码检查和公开首页、ATS 页走查。登录态、手机操作、真实模型和导出尚未在该轮完成验证。实施前须补充复现；发现与源码推断不同的表现时，先修订问题描述，不为满足计划机械修改代码。

不删除现有用户数据、旧路由或底座能力；不改变许可证；不把截图导入、经历库、完整定制和投递快照写成已实现功能。不引入支付、自动投递、爬虫或新运营后台。

## 二、执行顺序

| 阶段 | 任务 | 依赖 | 交付目标 |
| --- | --- | --- | --- |
| A | T0 基线与复现 | 无 | 当前行为与证据清楚 |
| B | T1 录入、T2 错误、T3 异步保护、T4 评分 | T0 | 基础流程可靠 |
| C | T5 AI 引导、T6 表单、T7 翻译 | T1—T4 | 用户知道下一步，操作可完成 |
| D | T8 表单与导航、T9 手机与待办、T10 生成反馈、T11 公共页面 | T5—T7 | 减少操作负担 |
| E | T12 回归与交付 | T1—T11 | 可追溯验收记录 |

按上述顺序实施，同一文件由同一执行者连续修改，避免表单、侧栏和岗位页同时发生冲突。完整经历库、截图识别和投递快照使用原业务总计划，单独验收。

## Chunk 1：基础功能可靠性

### T0：建立当前基线并复现

涉及：`AGENTS.md`、两份既有计划、复查报告；新增验收记录 `docs/acceptance/2026-10-05-functional-and-ux-optimization.md`（跨日执行时使用实际日期）。截图、日志和合成样本放入被 Git 忽略的 `artifacts/`，新增子目录先在验收记录注明用途与清理时机。

- [x] 检查 `git status --short`，保护当前大量未提交品牌改动，不回退、不覆盖。
- [x] 执行 `pnpm dlx @tanstack/intent@latest list`，按实际修改包加载对应技能（drizzle-kit#drizzle；本轮无 schema 变更，未跑迁移命令）。
- [x] 用新鲜构建启动本地服务，记录版本、运行环境、测试数据范围。（构建与 e2e 服务器启动已执行；登录态页面走查未做，属缺口）
- [ ] 使用测试账号走查岗位新建、详情、AI 设置、简历编辑和导出；登录由用户完成，不索取聊天明文密码。（缺口：本轮以 e2e 合成账号代替，真人登录走查待用户执行）
- [x] 分别记录无模型、模型不可用、模型可用时的表现；无真实 Key 时使用明确标记的 Mock 检查界面状态。（组件级四态均已覆盖；真实模型链路未验证）
- [ ] 截图记录桌面与 390px 手机布局，补充键盘操作路径。（缺口：以 e2e 视口断言代替截图；截图与辅助阅读工具检查待补）
- [x] 核对品牌计划末尾旧状态与已勾选项，修正文档矛盾；保留历史测试失败记录。（矛盾已在当轮工作区修正，本轮复核确认）

验收：明确哪些问题已复现、哪些仅源码确认、哪些需要真实模型或外部环境；不重复执行已完成的品牌清理。

### T1：岗位描述始终可手动录入（R1）

文件：`apps/web/src/features/applications/components/application-form-sheet.tsx`；拟新增同目录 `application-form-sheet.test.tsx`。

- [x] 将岗位描述输入区移出 `aiEnabled` 条件，保留原文保存与再次编辑。
- [x] 仅智能提取按钮依赖可用服务商，未配置时显示“配置 AI”，手动保存始终可用。
- [x] 区分服务商正在加载、加载失败、没有配置和已可用，不把网络失败伪装成没有配置。
- [x] 补充无服务商、测试失败和可用服务商三种状态测试。

验收：三种状态均可保存并重新打开完整 JD；未配置模型不会发起模型调用。

### T2：分开加载、空列表、失败与筛选无结果（R2）

文件：`apps/web/src/routes/dashboard/applications/index.tsx`、`-index.test.tsx`。

- [x] 加载时提供明确占位，不出现长时间空白。
- [x] 首次请求失败显示“暂时无法加载岗位”和重试按钮，不显示首次使用空状态。
- [x] 后台刷新失败时保留已取得的数据并提示刷新失败。
- [x] 真实空列表引导添加岗位；筛选无结果提供清除筛选。（清除筛选为既有实现，本轮保留并测试）
- [x] 用拒绝请求、延迟请求和恢复成功测试状态切换。

验收：断网不让用户误以为岗位丢失；重试后恢复列表，已输入筛选条件保留。

### T3：防止 AI 自动填充覆盖新输入（R3）

文件：`application-form-sheet.tsx`、其拟新增测试文件。

- [x] 为表单目标、打开周期和 JD 输入维护请求版本；切换目标、关闭或输入变更后旧结果失效。
- [x] 记录请求发出时的字段状态，回包只自动填写尚未被用户修改的字段。
- [x] 对已有用户值提供可接受建议，不能直接覆盖公司、岗位、地点或薪资。
- [x] 推荐由用户点击“智能提取”触发调用，粘贴只更新原文；如保留自动提取，必须明确提示并去重，不能隐式重复计费。（采用推荐方案：移除粘贴自动触发）
- [x] 覆盖慢回包、连续更换 JD、请求期间手动修改、切换编辑目标、关闭再打开等情况。

验收：过期回包不修改新表单；失败保留原文与手动内容；忙碌状态可理解且不阻止安全的手动保存。

### T4：评分绑定输入并拒绝过期结果（R4）

文件：`packages/api/src/features/applications/service.ts`、`ai.ts` 及对应测试；`apps/web/src/features/applications/components/application-ai-copilot.tsx`、`.test.tsx`；必要时修改 `packages/api/src/features/resume/service.ts` 与相应测试。

- [x] 岗位描述或关联简历改变时，清理或标记旧评分过期。
- [x] 同一关联简历正文被修改也必须使评分过期，不能只比较 `resumeId`。
- [x] 评分请求绑定用于计算的 JD 与简历内容版本或稳定指纹；记录评分时间。
- [x] 服务端写回时原子校验输入仍有效，不能仅在浏览器隐藏旧分数，也不能只做“写入前先查一次”的非原子检查。（事务 + 行锁 + 输入比对，冲突抛 409）
- [x] 查询展示时校验输入身份，避免旧版本分数恢复成有效结果；旧数据没有依据时按待重新评分处理。
- [x] 优先复用现有版本与元数据；若必须新增字段，先调整规范，再修改 schema，并用 `pnpm db:generate` 生成迁移。（指纹存入现有 `aiMetadata` jsonb，无 schema 变更、无迁移）
- [x] 覆盖修改 JD、更换简历、编辑同一简历、评分过程中更新输入、旧请求晚于新请求返回。（编辑同一简历经 getById 的 resume.updatedAt 比对覆盖）

验收：所有可见有效分数均对应当前输入；过期时显示“内容已更新，请重新评分”；未配置模型也能继续手动求职管理。

## Chunk 2：引导、表单与中文一致性

### T5：AI 前置条件变成可操作引导（R5）

文件：`application-ai-copilot.tsx`、`application-detail-sheet.tsx`、`application-form-sheet.tsx`；`apps/web/src/features/settings/integrations/hooks/use-has-usable-ai-provider.ts`；`apps/web/src/features/settings/integrations/components/ai-section.tsx`；`apps/web/src/routes/dashboard/-components/sidebar.tsx`。

- [x] 复用服务商状态逻辑，按每个 AI 操作的真实输入要求判断可用性，不把所有操作强行套成同一门槛。
- [x] 定制/评分缺少条件时提供“关联简历、补充岗位描述、配置 AI”直达入口。
- [x] 模型配置的用户名称改为“AI 模型”，本产品对外 API 凭证仍称 API Key，避免混淆。
- [x] 在本任务建立当前岗位返回上下文与会话草稿机制，补齐后回到原任务；按用户与岗位隔离，注销时清除，不永久保存 Key 或敏感原文。T8 复用此机制，不作为本任务的前置依赖。
- [x] 对配置无效、请求失败提供明确下一步，保留输入，禁止无提示重复调用。

验收：不再出现“详情提示粘贴 JD，但编辑页找不到输入框”的死路；缺配置时无需先点击失败才知道原因。

### T6：补齐表单标签、键盘和错误提示（R6）

文件：`application-form-sheet.tsx` 及测试；复用 `packages/ui/src/components/label.tsx`、`input.tsx` 的既有接口，优先修调用方。

- [x] 用稳定 id 关联 Label 与输入；必填字段具有可访问的必填状态。
- [x] 使用标准 form 提交语义，回车提交不与标签输入等局部交互冲突。
- [x] 提交不完整时显示字段错误并聚焦首个错误，而不只是让按钮一直不可点。
- [x] 检查关闭、取消、返回与未保存提示；不得用确认弹窗代替必要的草稿保存。

验收：点击标签可聚焦，辅助技术可识别字段，键盘可完成添加岗位、修正错误和返回。

### T7：统一状态和面试类型翻译（R7）

文件：拟新增 `apps/web/src/features/applications/labels.ts`；现有 `components/board.tsx`、`interview-dialog.tsx`、`table-view.tsx`、`application-detail-sheet.tsx`、`insights-view.tsx`；`apps/web/locales/zh-CN.po`。执行时搜索其他枚举展示使用点。

- [x] 前端以枚举值映射 Lingui 文案，统一看板、筛选、表单、时间线和统计。
- [x] 保持 schema 中的存储值与历史记录不变，不借翻译新增或重定义业务阶段。
- [x] 将“Screening”等名称翻译成与现有含义一致的中文；笔试阶段是否新增交给原 P5。（Screening → 筛选中；面试类型各自成译名）
- [x] 补切换中英文及未知值兼容检查。（labels.ts 对未知枚举值回退原值展示；zh-CN 目录 1583 条全译）

验收：中文界面阶段和面试类型无意外英文残留，语言切换生效，接口与存量数据兼容。

## Chunk 3：减少操作负担

### T8：简化录入与工作区导航（U1、U2）

文件：`application-form-sheet.tsx`、`application-detail-sheet.tsx`、`apps/web/src/routes/dashboard/-components/sidebar.tsx`；复用 `apps/web/src/dialogs/resume/import.tsx` 和现有简历创建入口。

- [x] 新建默认展示岗位描述、公司、岗位；薪资、来源、跟进等收入“补充信息”，必填校验不因折叠隐藏。
- [x] 保存后提供“关联简历”下一步，已有简历可直接选择；无简历时可创建或导入。
- [x] 将 T5 已建立的会话草稿与返回上下文机制用于创建/导入简历，离开前保护输入；继续保持用户隔离与注销清理。
- [x] 定义刷新后的恢复边界；若需要跨刷新恢复，另行实现安全的服务端草稿，不能承诺当前会话方案做不到的能力。（会话内存方案，UI 明示不跨刷新）
- [x] 主导航保持岗位、简历，设置合并，高级默认折叠；当前高级路由自动展开，旧链接继续有效。

验收：首次添加岗位无需遍历长表单；创建/导入简历后回到原岗位且输入未丢失；现有数据与旧路由保留。

### T9：手机列表与近期行动（U3）

文件：`apps/web/src/routes/dashboard/applications/index.tsx`；`apps/web/src/features/applications/components/board.tsx`、`table-view.tsx`、`calendar-view.tsx`、`application-card.tsx`。若现有表格不能适配手机，拟新增同目录 `mobile-list.tsx`。

- [ ] 先实际检查 390px 页面，再确定现有表格是否适合作为手机默认视图；避免将宽表格误称手机列表。（缺口：真机实测待补；依据 e2e 视口断言与既有表格移动端卡片实现）
- [x] 无显式视图选择时，手机默认单列卡片或列表，桌面默认看板；用户已选择的视图和 URL 优先，不能随窗口缩放反复跳变。
- [x] 卡片突出公司、岗位、阶段和最近行动；移动端通过按钮或菜单改状态，不要求拖动。
- [x] 复用已存在的面试、跟进数据显示“今天面试、待跟进”，支持进入相关岗位，并按用户时区处理日期。
- [x] 截止日期数据尚未实现时不做虚假提醒，待原计划新增该字段后接入。

验收：手机完成查看、添加、改状态不依赖横向拖动；刷新保留选择；提醒不重复，不把已结束/已归档岗位当作待办。

### T10：改善生成后的反馈与接受流程（U4）

文件：`application-ai-copilot.tsx`、`packages/api/src/features/applications/ai.ts` 及对应测试。

- [x] 本轮最小改动：成功后提供“打开新简历”，说明当前只重写简介及岗位关联发生的变化。
- [x] 显示生成前后简历入口，避免用户不知道副本去了哪里；不擅自覆盖原始简历。（结果面板含定制副本入口与原简历未改动说明）
- [x] 差异预览、接受后才关联、幂等接受、事实版本绑定，整体归入原 P4 单独实现，不做缺少后端保护的半套“确认”界面。

验收：当前生成成功后有明确下一步且能力边界准确；未完成的提案流程仍标记为待开发。

### T11：统一公共页面与能力说明（U5）

文件：`apps/web/src/features/homepage/page.tsx`、`site-footer.tsx`；`apps/web/src/routes/_home/-sections/header.tsx`、`footer.tsx` 及相应测试。

- [x] 首页与 ATS 复用一致的品牌和“进入工作区”文字入口，保留语言与主题能力。
- [x] 面向普通用户用“简历可读性检查”，辅助说明 ATS 的含义，不改变原检查范围。
- [x] 首页 AI 介绍明确“当前定制副本仅重写简介”。
- [x] 如调整许可展示，使用本地完整第三方许可说明，保留原版权和许可；不把原项目声明替换成全部原创声明。（评估后保留页脚指向原 LICENSE 全文的外链，符合品牌边界规范）

验收：跨页导航一致，手机入口清楚，没有夸大 AI 能力，许可文件和必要声明完整。

## 四、测试与验收

### T12：回归与交付

在仓库根目录执行，使用 Node 24.9.0+ 和项目固定 pnpm。遵守 `AGENTS.md` 的数据库、根 `.env` 隔离与恢复、E2E 限流及 IPv4 约定。凭据通过安全环境注入，不复制进文档或日志。

先按实际修改文件运行定向测试，例如：

```text
pnpm --filter web exec vitest run src/features/applications/components/application-form-sheet.test.tsx
pnpm --filter web exec vitest run src/routes/dashboard/applications/-index.test.tsx
pnpm --filter web exec vitest run src/features/applications/components/application-ai-copilot.test.tsx
pnpm --filter @reactive-resume/api exec vitest run src/features/applications/service.test.ts src/features/applications/ai.test.ts
```

首条测试文件是拟新增文件，实施后再运行。涉及其他模块时补对应测试，不为纯文字改名堆砌重复断言。

阶段终验命令：

```text
pnpm typecheck
pnpm exec turbo boundaries
pnpm test
pnpm build
pnpm exec playwright test --workers=2
git diff --check
```

- [x] 对实际修改的代码运行只读 `pnpm exec biome check <文件列表>`，不把会写文件的 `pnpm check` 当成只读检查。
- [x] 新增 E2E 建议放在 `tests/e2e/specs/application-ux.spec.ts`，使用合成资料；先核对现有 fixture 和命名约定。
- [ ] 用新鲜构建验证无 Key 完整手动流程及中文 PDF/DOCX 导出，人工打开文件检查布局。（缺口：无 Key 手动流程由 e2e 覆盖；中文导出人工目检未执行）
- [x] 分别记录单测/Mock、浏览器、真实模型、真实邮件和线上验证，不用 Mock 替代真实模型结论。（真实模型/邮件/线上为缺口，已在验收记录明示）
- [x] 验证跨账号草稿隔离、退出清理、重试和返回上下文。（store 级单测；浏览器级验证待登录态走查）
- [x] 补全键盘流程和手机走查；截图不等于完整无障碍验收。（单测+e2e；无障碍完整验收仍待补）
- [x] 全量失败与隔离复跑分别记录；未定位原因时不直接归因为环境抖动。

最低验收场景：无 Key 保存 JD；首次加载失败后重试；后台刷新失败保留数据；AI 慢回包遇到手动修改；切换岗位后旧回包失效；修改同一简历后评分失效；配置模型后返回；空简历引导创建；中文切换；手机改状态；键盘修正必填错误。

## 五、后续业务功能与部署边界

- 原 P1：邀请机制、模型连接与能力探测，复用已有能力，避免重复建设。
- 原 P2—P3：真实经历库及岗位截图/文字导入，用户先确认事实。
- 原 P4：完整简历定制、差异预览、事实与版本绑定、幂等接受。
- 原 P5：投递冻结快照、历史文件、跟进与备份恢复。

以上功能不是本轮全部重做。完成相应验收后才更新首页宣传。数据库变更走正式迁移，部署前备份数据库与文件，并验证旧镜像兼容性；仅前端变更也要记录构建与回滚版本。部署须用户明确授权，并使用项目自有流程，不自动 push。

## 六、交付与当前状态

实施交付：功能代码、必要回归测试、更新后的规范与计划、脱敏验收记录及未验证项。验收材料按项目约定保存，清理无用临时文件，保留必要证据。

- [x] 将复查发现整理为本实施计划。
- [x] T0—T12 实施与验收（2026-10-05；缺口见验收记录第七节）。
- [ ] 原业务总计划后续阶段实施。

2026-10-05 实施记录：R1—R7、U1—U5 已全部实施，定向测试、typecheck、boundaries、build、E2E 通过（应用岗位相关 e2e 全过；全量并行下个别与本轮无关的用例偶发失败、隔离复跑通过，明细见验收记录）。未修改任何真实用户数据；未提交、未推送、未部署。验收证据见 `docs/acceptance/2026-10-05-functional-and-ux-optimization.md`。下一位执行者从登录态走查与真实模型验证开始，再考虑原 P1—P5。
