# 验收记录：简历导入留存原始文件（原件保真）

- 日期：2026-11-05（部署：2026-11-06）
- 状态：已完成并上线
- 关联需求：导入 PDF/DOCX 后版式丢失，用户要求保留与上传文件逐字节一致的"原件"

## 实现范围

- 新表 `resume_original_file`（迁移 `20261105134400_resume_original_file`），与 resume 一对一，级联删除。
- 导入（`resume.import`）可选携带 `originalFile { name, mediaType, data(base64) }`，≤10 MiB，仅 PDF/DOCX；保存 best-effort，失败不阻断内容导入。`duplicate` 同步复制原件。
- 存储键 `uploads/<userId>/originals/<resumeId>`（无扩展名）；`/api/uploads/*` 公开路由屏蔽 `originals/` 前缀（`isPrivateUploadPath`），原件只能走签名路由。
- 签名下载：token 增加 `kind: "rendered" | "original"`（缺省 rendered，向后兼容旧 token），新路由 `GET /api/resumes/:id/original`；`?inline=1` 仅对 PDF 内联，其余强制附件；RFC 5987 `filename*` 支持中文文件名。
- oRPC：`resume.originalFile.get`（元数据 + `unchanged` 徽章）/ `getDownloadUrl`（签名 URL，`pdfExportRateLimit`）。
- 一致性判定：导入时存 `sha256(JSON.stringify(resume.data))` 基线（两侧均从 jsonb 读回计算，键序由 Postgres 归一化），不依赖 `updatedAt`（任何变更都会刷新）或会被 30 条滚动窗口裁剪的 `"Imported"` 版本快照。
- Web：导入对话框对 PDF/DOCX 附带原件（>10 MiB 时 toast 提示不保留、内容仍导入）；构建器下载对话框新增"原件"行（文件名/大小 + 一致性徽章 + 下载/查看）。
- i18n：`lingui extract` 新增 5 条消息，zh-CN 已翻译（其余语言空串走英文回退）。

## 真实验证（生产模式，本机）

基础设施：docker postgres(localhost:5433) + redis(6379)；`NODE_ENV=production PORT=3000 node apps/server/dist/index.mjs`（Node 24.9.0），启动时自动应用迁移。

| 步骤 | 结果 |
| --- | --- |
| 注册测试账号、带 `originalFile` 导入 azurill.pdf（243445 字节） | ✅ 返回 resumeId |
| 落盘 `data/uploads/<uid>/originals/<resumeId>` | ✅ sha256 `c527201c857d62c7` 与上传文件一致 |
| `originalFile/get` | ✅ filename/mediaType/size/`unchanged:true` |
| 公开路由 `GET /api/uploads/<uid>/originals/<resumeId>` | ✅ 404 |
| `getDownloadUrl` → 下载 | ✅ sha256 逐字节一致；`attachment` + RFC 5987 头；`?inline=1` 时 `inline` |
| `resume.update` 改 `basics.email` 后再查 | ✅ `unchanged:false`（此前误改 schema 会剥离的 `basics.summary` 时不变，属预期） |
| `duplicate` | ✅ 副本有独立原件（新存储键，`unchanged:true`） |
| 无 token / 坏 token 访问原件路由 | ✅ 401 |
| 删除两份简历 | ✅ 存储目录清空（0 文件）、`resume_original_file` 行清空（0 条） |
| 测试数据清理 | ✅ 测试用户、存储目录、临时文件均已删除 |

## 自动化测试

- `packages/api`：`original-file.test.ts`（14 例：hash、保存校验/回滚、复制、读取、路由 get/URL）、`pdf-download-url.test.ts`（+kind 往返/专用路径）、`crud.test.ts`（+4 例接线：透传/缺省/失败不阻断/复制）、`dto/resume.test.ts`（+5 例 import 输入校验）。
- `apps/server`：`resume-original.test.ts`（7 例）、`uploads.test.ts`（+originals 前缀 404）。
- `apps/web`：`import.dialog.test.tsx`（+2 例：携带原件 / 超限省略）。

## 已知坑位（环境）

- 根目录 `.env` 被 `packages/env` 自动加载会让 view-dedup / rate-limit / statistics 等单元测试连真实 Redis 而失败；按既有约定临时移开 `.env` 后全部通过（api 包全量 468 例，除既有 skip）。
- 本机 `pnpm dev`（tsx watch）卡在 `reapStableAgentRuns` 动态导入处，Node 24.0.2 与 24.9.0 均复现，与本次改动无关（历史验收均为生产模式）；本次验证同样采用生产模式。
- Node 24.0.2 下 `lingui extract` 静默无输出且不写目录；切 24.9.0 后正常。

## 未验证 / 缺口

- 未做真实浏览器端到端点击（UI 行为由 11 例对话框测试覆盖；下载/查看按钮的网络层已在本地与生产各用 curl 等价验证）。
- AI 解析路径未用真实模型验证（本地解析路径即可完成原件保存链路，与 AI 无关）。
- 投递跟踪（applications）自动使用原件、公开页原件下载明确不做（原件仅所有者私有）。

## 生产部署（2026-11-06，增量 dist 补丁）

- 背景：`interview-manage:20261105` 镜像由 11-05 晚间工作区构建，其 server dist 是中间态——RPC 过程（`resume.originalFile.*`）与 DB 迁移已上线，但 HTTP 下载路由（`resume-original.ts` + app.ts 注册）与 web dist 的原件 UI 缺失（线上 `/api/resumes/:id/original` 无 token 返回 404 而非 401）。
- 依赖树与迁移均未变（无 lockfile diff；`resume_original_file` 表已在生产库），符合既有**增量补丁路径**：本地完整构建（11-05 23:08）打包 `apps/{server,web}/dist`（tar.gz 14.9MB，sha256 `87f51d7b…` 单片直传校验一致）→ `docker create 20261105` → `docker cp` 覆盖 → `docker commit` 为 `interview-manage:20261106`（sha256 `a887ab17…`）→ compose.yml 切 tag（备份 `compose.yml.bak-20261106`）→ `docker compose up -d app`。
- 生产冒烟（https://interview.unlimit.ltd）：
  - `/api/resumes/:id/original` 无 token / 坏 token → 401 ✅
  - `resume.originalFile.get` RPC → UNAUTHORIZED（过程存在）✅
  - `/api/uploads/<any>/originals/<id>` 公开路由 → 404 ✅
  - 全链路（邀请码一次性 probe 账号）：导入带原件 → `unchanged:true` → 签名 URL 下载 sha256 `c527201c857d62c7` 与上传文件逐字节一致 ✅ → 删简历后 `resume_original_file` 0 行、`/app/data/uploads/*/originals/` 0 文件 ✅
  - 主站 / `/api/health` / 登录页 200 ✅；web dist 含英文 msgid 与 zh-CN 翻译 chunk（`zh-CN-D0PbkygK.js`）✅
  - probe 账号、邀请码、临时文件已全部清理；磁盘 28%（28G 可用）。
- 回滚路径：`compose.yml` 改回 `image: interview-manage:20261105` 后 `docker compose up -d app`（20261105 镜像保留；该回滚会使 HTTP 下载路由缺失回中间态，但 RPC 与表结构兼容，不损数据）。
