# 功能与交互优化实施验收（2026-10-05）

- 日期：2026-10-05
- 状态：T1—T12 已实施并完成本地验证；登录态人工走查与真实模型调用仍为缺口（见第七节）。
- 实施计划：`docs/plans/2026-10-05-functional-and-ux-optimization.md`
- 依据报告：`docs/acceptance/2026-10-05-product-ux-review.md`（R1—R7、U1—U5）
- 工作区：`D:\program\interview-manage`；运行环境 Node 24.9.0（`D:\Development_environment\nvm\v24.9.0`）、pnpm 12.6.0、Windows 11。
- 本次未提交、未推送、未部署。品牌改动的未提交工作区文件（AGENTS.md、CLAUDE.md、docs 下 4 个文件）保持原样未覆盖。

## 一、实施范围与结果

| 任务 | 结果 | 主要文件 |
| --- | --- | --- |
| T0 基线与复现 | 完成 | 本记录第二节 |
| T1 岗位描述始终可录入（R1） | 完成 | `application-form-sheet.tsx` |
| T2 列表加载/失败/空态分离（R2） | 完成 | `routes/dashboard/applications/index.tsx` |
| T3 自动填充覆盖保护（R3） | 完成 | `application-form-sheet.tsx` |
| T4 评分绑定输入并拒绝过期（R4） | 完成 | `packages/api` service/ai/DTO + copilot |
| T5 AI 前置条件引导（R5） | 完成 | copilot + 详情页 + 侧栏命名 + 会话草稿 |
| T6 表单标签/键盘/错误（R6） | 完成 | `application-form-sheet.tsx` |
| T7 阶段与面试类型翻译（R7） | 完成 | `labels.ts` + 6 个展示点 + zh-CN 目录 |
| T8 简化录入与导航（U1/U2） | 完成 | 表单核心/补充分组、保存后关联简历、侧栏折叠分组 |
| T9 手机列表与近期行动（U3） | 完成 | 移动默认列表 + `today-actions.tsx` |
| T10 生成后反馈（U4） | 完成 | copilot 定制结果面板 |
| T11 公共页面一致性（U5） | 完成 | 首页 AI 边界、ATS 更名、公共页头统一 |
| T12 回归与交付 | 完成（缺口见第七节） | 本记录 |

## 二、T0 复现结论

按复查报告逐条核对当前源码，全部与报告一致，未发现需要先修订问题描述的偏差：

- R1：`aiEnabled` 包住整个岗位描述输入区（原 `application-form-sheet.tsx:108/214`）。已复现（源码级）。
- R2：列表仅读 `data/isPending`，失败落入 EmptyState（原 `index.tsx:92/154`）。已复现。
- R3：autofill 直接覆盖、粘贴即触发请求、无版本保护。已复现。
- R4：`update()` 不清理 matchScore；`setAiResult` 无输入校验。已复现。
- R5：copilot 不读服务商状态；详情页仅文字提示。已复现。
- R6：Field 无 `htmlFor`，无字段级错误。已复现。
- R7：`stage.label`、`kind.label` 直接展示英文。已复现。
- U1—U4：与源码一致。U3 原表格已有移动端卡片列表（`table-view.tsx`），缺的是"手机默认列表"与今日行动。
- 登录态走查、390px 真机截图、真实模型：未在本轮执行，见第七节。
- 文档核对：品牌计划尾部状态与 markdownlint 记录两处矛盾已在当前工作区修正（属上一轮遗留的未提交改动，本轮确认无需再改）。

## 三、关键实现说明

1. **表单（T1/T3/T6/U1）**
   - 岗位描述手风琴不再受 `aiEnabled` 控制；"AI 智能提取"按钮按服务商四态（加载中/加载失败/未配置/可用）分别提示，未配置时显示"配置 AI"入口，手动保存永不受限。
   - 粘贴不再自动触发模型调用，仅在用户点击"AI 智能提取"时发起；请求带序号快照，回包只填充未被用户修改的字段，被改字段以"建议"呈现、点击"Use"才覆盖；JD 变更、切换目标、关闭/重开均使在途结果失效。
   - 表单改用标准 `<form>` 提交；必填字段有 `aria-required`、`aria-invalid` 与字段级错误文本，提交不完整时聚焦首个错误字段；标签以 `htmlFor` 关联输入（附件/组合框类字段以标题形式呈现）。
   - 新建默认展示"岗位描述、公司、岗位"，其余收入"补充信息"折叠区（必填项不在折叠区内）；保存成功后停留在"关联简历"面板，可选已有简历、新建或导入（经会话草稿与返回上下文回到原岗位）。
2. **会话草稿（T5/T8）**：`session-draft.ts` 以 `用户:岗位` 为键，内存保存（刷新即失效，UI 明示）；离开创建/导入简历时保护输入，返回后自动重开表单并恢复；注销与注销户时 `clearAll()`（`user/dropdown-menu.tsx`、`settings/pages/account.tsx`）。
3. **评分过期（T4）**
   - `update()` 在 JD 或关联简历变化时同一语句清空 `matchScore/aiMetadata`。
   - `setAiResult` 新增 `expect` 参数：事务 + 行锁内校验 JD 原文、resumeId、简历 `updatedAt` 仍与评分请求一致，否则抛 `CONFLICT`（409），过期回包永不落库。
   - 评分写入 `aiMetadata.matchScoreInput`（JD 哈希、resumeId、简历哈希、评分时间），未新增表字段、无迁移。
   - `getById` 派生 `aiScore.stale`：哈希不匹配、简历更换、简历在评分后被编辑、或旧数据无绑定记录，均判定过期；前端显示"内容已更新，原评分不再适用"并提供重新评分。
4. **列表状态（T2）**：加载骨架、首次失败"暂时无法加载"+重试、后台刷新失败保留数据并提示、真实空列表才显示首次使用引导；筛选无结果维持原有"清除筛选"。
5. **翻译（T7）**：`labels.ts` 以枚举值映射 Lingui 文案，看板/表格/表单/时间线/统计/操作菜单/日历统一接入；schema 存储值与历史数据不变；zh-CN 目录 1583 条全部翻译（含新增阶段/面试类型/表单文案）。
6. **导航（T8/U2）**：主导航保留岗位、简历；"工具与设置"与"高级"为折叠分组（默认收起、进入其路由自动展开、手动收起后不自动展开）；"Integrations"更名为"AI Models"（zh：AI 模型），路由不变。
7. **手机（T9/U3）**：URL 无显式 `view` 时小屏默认列表、桌面默认看板；`view` 从 strip 默认集中移除，用户显式选择（含看板）始终保留在 URL，缩放不跳变、刷新保留；新增"今天面试/待跟进"汇总（用户时区，排除已归档与已拒绝）。
8. **公共页（T11/U5）**：ATS 页面向用户更名为"简历可读性检查"（meta 标题保留 ATS 辅助说明）；`_home` 页头与首页共用品牌文字与"进入工作区"入口；首页 AI 说明明确"定制副本目前仅重写个人简介"。页脚许可链接保持指向原项目 LICENSE 全文（保留原版权声明，符合品牌边界规范），未做本地化改写。

## 四、测试与验证记录

全部命令在仓库根目录执行，Node 24.9.0（首轮在 24.0.2 下出现 EMFILE，与 `AGENTS.md` 记载一致，切换后消失）。

1. **定向测试（真实执行）**
   - `apps/web`：`application-form-sheet.test.tsx`（7）、`application-ai-copilot.test.tsx`（6）、`routes/dashboard/applications/-index.test.tsx`（7）、`session-draft.test.ts`（5）、`insights.test.ts`（4）、`interviews/csv` 等（合计 43）全部通过。
   - `packages/api`：`service.test.ts`（32，含清分/原子写回/getById 派生）、`ai.test.ts`（13，含指纹绑定/CONFLICT 传递）全部通过。
   - 公共页：`header.test.tsx`（4，更新断言）、`footer.test.tsx`（3）通过。
2. **只读检查**：`pnpm exec biome check <33 个改动文件>` 无错误（2 条信息级输出，无 lint 违规）；未使用会写文件的 `pnpm check` 检查（修复格式时仅对改动文件列表使用 `--write`）。
3. **类型与边界**：`pnpm typecheck` 全部包通过；`pnpm exec turbo boundaries` 1119 个文件无问题；`git diff --check` 干净。
4. **全量测试**：`pnpm test`（移走根 `.env`，测后恢复）。结果：
   - `web`、`auth`（隔离复跑 28/28）等包通过；
   - `@reactive-resume/api` 并行运行时 `src/features/resume/statistics.test.ts` 2 例失败（"public download statistics procedure"）；该模块本轮未改动（最后改动为上游基线 `b53c43c`）；隔离复跑 `src/features` 全部 411 例通过。按 `AGENTS.md` 要求保留失败记录，不默认归因环境，也不以隔离复跑宣称全量并行稳定。
5. **构建**：`pnpm build` 全部包成功（2026-10-05，本机）。
6. **E2E**：见第五节。

## 五、E2E（合成资料，无真实模型）

- 更新 `tests/e2e/specs/applications-tracker.spec.ts`：按 U1 结构在填写次要字段前展开"补充信息"、保存后经"完成"关闭关联简历面板（断言未放松）。
- 新增 `tests/e2e/specs/application-ux.spec.ts`（合成资料，`--workers=2` 下 6 例与 tracker 共 6 例全部通过）：
  1. 无 Key 保存 JD 并重新打开核对原文；"AI 智能提取"按钮禁用且页面说明无模型；
  2. 键盘完成提交：空提交出现字段错误并聚焦首个错误项，回车逐步修正后成功；
  3. 列表请求失败显示"暂时无法加载"+重试，恢复后列表出现（不出现首次使用空态）；
  4. 390px 视口默认列表视图，卡片进入详情，按钮改阶段（无拖动）。
- 过程记录（保留排查依据）：
  - 拦截尝试发现 oRPC 查询经 BatchLinkPlugin 合并为 `POST /api/rpc/<first-path>/__batch__`，流式请求体无法在 `page.route` 中读取，最终以"拦到报错出现→解除→重试"模拟断网；该发现已写为用例注释。
  - 创建成功的 toast 悬浮于表单底部按钮之上且 hover 会暂停自动关闭，e2e 以主动关闭 toast 处理（组件行为本身不属于缺陷）。
- 全量套件（`--workers=2`）首轮：29 过 / 4 失败 / 7 跳过。逐项定位：
  - `application-ux`（重试）、`applications-tracker`（新增的"完成"步骤）：本轮新写用例自身问题，已修复并复跑通过；
  - `lock-resume`、`cover-letter-library`：既有偶发，`docs/acceptance/2026-10-04-product-branding.md` 已有同类记录；lock-resume 隔离复跑通过；cover-letter-library 隔离一次失败（strict mode：库中出现两条同名信）一次通过，未定位根因，保留记录（疑为既有双重提交问题，与本轮改动文件无交集）。
- 全量套件最终复跑结果见第八节。

## 六、最低验收场景对照

| 场景 | 覆盖方式 | 结果 |
| --- | --- | --- |
| 无 Key 保存 JD | 单测 + e2e 1 | 通过 |
| 首次加载失败后重试 | 单测 + e2e 3 | 通过 |
| 后台刷新失败保留数据 | 单测（路由级） | 通过 |
| AI 慢回包遇到手动修改 | 单测（表单 T3） | 通过 |
| 切换岗位后旧回包失效 | 单测（表单 T3） | 通过 |
| 修改同一简历后评分失效 | API 单测（stale 派生 + 写回 CONFLICT） | 通过 |
| 配置模型后返回 | 引导入口直链设置页（e2e 断言链接） | 通过（返回上下文为单测级） |
| 空简历引导创建 | 表单"创建/导入简历"入口 + 保存后关联面板 | 通过（组件级） |
| 中文切换 | zh-CN 目录 1583 条全译 + labels 全接入 | 通过（运行时人工复核待登录态走查） |
| 手机改状态 | e2e 4 | 通过 |
| 键盘修正必填错误 | 单测 + e2e 2 | 通过 |

## 七、剩余缺口（不因本轮实施而消失）

1. **登录态人工走查**：新建→关联→评分→导出的完整手感、返回上下文的实际体验、草稿提示文案，需用户在浏览器登录后复核（本轮以单测/e2e 代替，未索取或使用任何真实账号密码）。
2. **真实模型调用**：评分、定制、起草的模型链路及 CONFLICT 在真实延迟下的表现未验证（无 Key，全部为 Mock/单测/e2e 层）。
3. **390px 真机截图与辅助阅读工具检查**：本轮以 e2e 视口断言代替，截图不等于完整无障碍验收。
4. **中文 PDF/DOCX 导出人工目检**：本轮未重新执行导出链路（上一轮验收记录中 PDF 人工目检本就待复核）。
5. **并行失败定位**：`resume/statistics.test.ts` 并行 2 例失败未定位根因（隔离通过），保持失败记录。
6. **线上验证**：生产仍运行改版前镜像；本轮未部署。

## 八、补充执行结果

- E2E 全量第二轮（`--workers=2`，2026-10-05）：30 通过 / 3 失败 / 7 跳过；3 个失败（`oauth-consent`、`section-date-sorting`、`section-editing`，均为本轮未触碰的模块）隔离复跑（`--workers=1`）全部通过。两轮并行失败的用例集合完全不同（第一轮为 application-ux/tracker/cover-letter-library/lock-resume），与本机"高并行偶发资源饿死"的既有记录特征一致；未定位根因前不宣称全量并行稳定。
- 应用岗位相关 e2e（`application-ux.spec.ts` + `applications-tracker.spec.ts`）最终以 `--workers=2` 全部通过。
- e2e 之后重建 `web`（`pnpm --filter web build`），使本地构建产物与最终语言目录一致（此前构建早于最后一轮目录提取，仅差 3 条文案）。

## 九、产物与清理

- `artifacts/`：本轮未新增截图或中间产物（e2e 失败.trace 默认写入 `test-results/`，不入 Git）。
- 无临时文件遗留；`.env` 测试期间移位并已恢复（校验：`.env` 在位，`.env.local` 未动）。
