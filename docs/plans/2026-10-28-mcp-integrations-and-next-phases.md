# MCP 生态接入上线与后续阶段执行计划

> 执行者必读：开始任何操作前先完整阅读根目录 `AGENTS.md`、主计划 `docs/plans/2026-10-02-ai-job-resume-management.md` 及部署记录 `docs/acceptance/2026-10-05-branding-deployment.md`。严格遵守中文沟通、英文代码/提交信息、单测前临时移走根 `.env`、Node 24.9.0+ 运行环境、禁止自动 `git push` 等规范。

- 制定日期：2026-10-28
- 当前状态：MCP 品牌标识同步与 `tooling/integrations/`（WorkBuddy + OpenAI / Codex）接入包已在本地完成开发与单测验证；待执行本地分批提交、线上增量补丁部署、客户端真机联调，随后衔接主计划 P1—P5。
- 工作区：`D:\program\interview-manage`
- 线上主入口：`https://interview.unlimit.ltd`

---

## 一、当前工作区盘点（严禁回退已有改动）

接手 Agent 第一步运行 `git status --short` 核对工作区。当前未提交改动分为两个独立批次，均需保留并分批提交：

| 批次 | 涵盖目的 | 涉及文件范围 |
| :--- | :--- | :--- |
| **Batch A：多入口域名与认证错误本地化** | 支持 `TRUSTED_ORIGINS` 环境变量、Nginx `interview.unlimit.ltd` 站点配置、登录/注册/2FA 错误提示中文化与语言包同步 | `.env.example`、`turbo.json`、`packages/env/src/server.ts`、`packages/auth/src/{config,trusted-origins,trusted-origins.test}.ts`、`apps/web/src/libs/error-message{,.test}.ts`、`apps/web/src/features/auth/pages/*.tsx`、`apps/web/locales/*.po`、`tooling/deployment/server/{.env.example,nginx-interview-manage.conf}` |
| **Batch B：MCP 品牌统一与双平台接入包** | 将 MCP `serverInfo.name` 统一为 `interview-manage`（单一来源 `brand.ts`），提供 WorkBuddy 与 OpenAI / Codex 连接器清单、零 BYOK 依赖的 `SKILL.md` 及防漂移契约单测 | `AGENTS.md`、`packages/utils/src/brand.ts`、`packages/mcp/src/mcp-server-card{,.test}.ts`、`packages/mcp/src/integrations.test.ts`、`tooling/integrations/**` |

---

## 二、执行阶段总览

按 **S1 → S2 → S3 → S4** 顺序推进，前一阶段完成验收并记录后再进入下一阶段：

| 阶段 | 阶段名称 | 核心交付目标 |
| :--- | :--- | :--- |
| **S1** | 本地构建复核与分批 Git 提交 | 确认 `web` 与 `server` 生产构建通过，将 Batch A 与 Batch B 拆分为两个清晰的英文 commit（不执行 `git push`） |
| **S2** | 线上增量补丁部署与 Server Card 验收 | 将最新 `apps/web/dist + apps/server/dist` 增量同步至 `https://interview.unlimit.ltd`，验证线上 `/.well-known/mcp/server-card.json` 返回 `"name": "interview-manage"` |
| **S3** | WorkBuddy / Codex 真机端到端验收与提审 | 使用测试账号 API Key 挂载 `tooling/integrations/`，完成「JD 匹配 → 克隆改写完整简历 → 生成 PDF 下载链接 → 记录投递」真机闭环 |
| **S4** | 衔接站内 P1—P5 核心业务迭代 | 按主开发计划推进 P1（邀请与模型探测）→ P2（真实经历库）→ P3（岗位截图 OCR 导入）→ P4（站内完整简历定制）→ P5（投递冻结快照与备份恢复） |

---

## 三、分阶段详细执行步骤

### 阶段 S1：本地构建复核与分批 Git 提交

#### 1. 环境与增量部署前提检查
在仓库根目录（PowerShell）确保使用 Node 24.9.0+：

```powershell
$env:PATH = "D:\Development_environment\nvm\v24.9.0;$env:PATH"
node --version
git diff pnpm-lock.yaml migrations/
```

- [ ] 确认 `node --version` 为 `v24.9.0` 或更高。
- [ ] 确认 `pnpm-lock.yaml` 与 `migrations/` 无任何未提交变更（满足 `AGENTS.md` 增量补丁部署前提）。

#### 2. 定向测试与生产构建
单测前必须按 `AGENTS.md` 临时移走根目录 `.env`（防止连上真实 Redis 相互污染），并在 `finally` 中恢复：

```powershell
$envMoved = $false
if (Test-Path .env) { Move-Item .env .env.test-backup -Force; $envMoved = $true }
try {
  pnpm.cmd --filter @reactive-resume/auth test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  pnpm.cmd --filter @reactive-resume/mcp test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  pnpm.cmd --filter web exec vitest run src/libs/error-message.test.ts src/brand-promo-remnants.test.ts
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  if ($envMoved -and (Test-Path .env.test-backup)) { Move-Item .env.test-backup .env -Force }
}
pnpm.cmd typecheck
pnpm.cmd exec turbo boundaries
pnpm.cmd --filter web build
pnpm.cmd --filter server build
pnpm.cmd exec markdownlint-cli2 AGENTS.md tooling/integrations/**/*.md docs/plans/2026-10-28-mcp-integrations-and-next-phases.md
git diff --check
```

- [ ] 上述单测、类型检查、包边界、前后端构建、Markdown 检查与行尾检查全部通过。
- [ ] 核对 `.env` 已恢复原位，无 `.env.test-backup` 残留。

#### 3. 分批 Git 提交（禁止自动 push）
- [ ] **Commit 1（Batch A）**：暂存 `.env.example`、`turbo.json`、`packages/env/src/server.ts`、`packages/auth/`、`apps/web/src/libs/error-message*`、`apps/web/src/features/auth/pages/`、`apps/web/locales/`、`tooling/deployment/server/`，提交信息示例：
  `feat(auth): support TRUSTED_ORIGINS and localize auth error messages`
- [ ] **Commit 2（Batch B）**：暂存 `AGENTS.md`、`packages/utils/src/brand.ts`、`packages/mcp/`、`tooling/integrations/` 及本计划文件，提交信息示例：
  `feat(mcp): unify server card brand identity and add WorkBuddy/OpenAI integration manifests`
- [ ] 运行 `git status --short` 确认工作区干净（`artifacts/` 等未跟踪本地目录不入库）。

---

### 阶段 S2：线上增量补丁部署与 Server Card 验收

> 警告：严格遵循 `AGENTS.md`「服务器部署约定」与 `docs/acceptance/2026-10-05-branding-deployment.md` 的实战经验。

#### 1. 部署前服务器状态与磁盘检查
- [ ] 检查服务器磁盘空间（`df -h`），确保可用空间充足（曾发生 `mihomo` 容器日志撑满磁盘导致 postgres 进 recovery）。
- [ ] 记录 `/opt/interview-manage/compose.yml` 当前正在运行的 `app` 镜像 tag（例如 `interview-manage:20261005`），保留该镜像作为一键回滚点。

#### 2. 制作并传输 `dist` 增量补丁包
由于 `pnpm-lock.yaml` 与 `migrations/` 未变，仅打包 `apps/web/dist` 与 `apps/server/dist`：

- [ ] 在本机将 `apps/web/dist` 与 `apps/server/dist` 打包为 `dist-patch-20261028.tar.gz`，计算本机 `sha256`。
- [ ] 传输至服务器 `/opt/interview-manage/`（如遇 SSH 大流量掐断，采用分片并行续传，拼接后**必须比对整体 sha256**，坏片单独重传）。

#### 3. 容器内替换构建产物并切换镜像
参照 `Dockerfile` 的 runtime 结构（`WORKDIR /app`，`USER node`，构建产物位于 `/app/apps/web/dist` 与 `/app/apps/server/dist`）：

- [ ] 基于当前线上镜像创建临时容器：`docker create --name patch-tmp <当前镜像tag>`。
- [ ] 解压补丁并覆盖容器内 `/app/apps/web/dist` 与 `/app/apps/server/dist`。
- [ ] 提交为新镜像：`docker commit --change 'USER node' --change 'WORKDIR /app' --change 'CMD ["node", "apps/server/dist/index.mjs"]' patch-tmp interview-manage:20261028`，随后删除 `patch-tmp`。
- [ ] 更新 `/opt/interview-manage/compose.yml` 的 `app` 镜像 tag 为 `interview-manage:20261028`，执行 `docker compose up -d app`。

#### 4. 线上验收与清理
- [ ] 检查 `https://interview.unlimit.ltd/api/health` 返回 HTTP 200，`database`、`storage`、`redis` 均为 `healthy`。
- [ ] 检查 `https://interview.unlimit.ltd/.well-known/mcp/server-card.json`：
  - `serverInfo.name` 必须为 `"interview-manage"`（不再是 `"reactive-resume"`）；
  - `serverInfo.title` 必须为 `"求职管理"`；
  - `tools` 数组包含全部 44 个工具。
- [ ] 运行线上冒烟脚本 `/opt/interview-manage/smoke.mjs`（注意 `APP_URL` 与 `SMOKE_URL` origin 必须一致；服务器上 hairpin 不可靠时优先使用 `127.0.0.1` 或 `--resolve`）。
- [ ] 清理本机与服务器上的临时补丁包、分片文件及临时日志。
- [ ] 新建验收记录 `docs/acceptance/2026-10-28-mcp-integrations-deployment.md`，如实记录命令、sha256、验证结果与回滚 tag。

---

### 阶段 S3：WorkBuddy / Codex 真机端到端验收与生态提审

#### 1. 准备测试账号凭据
- [ ] 使用测试账号登录 `https://interview.unlimit.ltd/dashboard/settings/api-keys`，生成测试用 API Key（严禁将真实或测试 Key 写入版本库文件）。
- [ ] 在本地终端注入环境变量 `INTERVIEW_MANAGE_API_KEY=<测试Key>`。

#### 2. 真机挂载与 5 步工作流验收
分别在 WorkBuddy（加载 `tooling/integrations/workbuddy/`）和 Codex / 支持 Streamable HTTP MCP 的客户端（加载 `tooling/integrations/openai-plugin/mcp.json` 与 `SKILL.md`）中发送一段合成的目标岗位 JD，验证以下 5 项行为：

- [ ] **读取基准简历**：助手自动调用 `list_resumes` 与 `read_resume`，准确列出当前简历中的真实经历。
- [ ] **匹配与差距分析**：助手输出匹配亮点，并将简历中未体现的 JD 要求单独列入「差距提示」，未编造任何经历。
- [ ] **克隆副本与定向改写**：经确认后，助手先调用 `duplicate_resume` 创建岗位专属副本，再调用 `apply_resume_patch` 修改副本，**原主简历内容未被覆盖**，且副本中的公司、学校、时间段、业绩数字未被篡改。
- [ ] **一步交付 PDF 链接**：助手自动调用 `download_resume_pdf` 返回 10 分钟有效的 `downloadUrl`，浏览器打开可正常下载中文 PDF。
- [ ] **投递与面试记录**：助手调用 `create_application` / `update_application` 绑定新简历副本，并能调用 `add_application_interview` 写入面试日程。

#### 3. 开放平台打包提审与临时文件清理
- [ ] 按 WorkBuddy 开放平台要求将 `tooling/integrations/workbuddy/` 打包上传提审。
- [ ] **立即清理**本地打包生成的 `.zip` 压缩包，确保 `git status --short` 无遗留压缩包。
- [ ] 将真机联调结果与截图（脱敏合成数据）补充记录至 `docs/acceptance/2026-10-28-mcp-integrations-deployment.md`。

---

### 阶段 S4：衔接站内核心业务迭代（P1 → P5）

完成外部生态连接器上线后，回到主计划 `docs/plans/2026-10-02-ai-job-resume-management.md` 与 `docs/plans/2026-10-04-product-branding-and-optimization.md` 的 Chunk 2（F1—F6），按阶段门禁依次推进，并在每阶段同步扩展 MCP 能力：

1. **P1（F1）：多用户内测入口与 AI 配置**
   - 实施落点：`packages/auth`、`packages/api/src/features/ai-providers/`、`apps/web/src/features/settings/`。
   - 关键验收：管理员 CLI 一次性邀请码；文字模型（DeepSeek 等）与视觉模型能力分别探测；自定义模型地址 SSRF 防护复核；两账号数据与 Key 完全隔离。
2. **P2（F2）：真实经历库与事实版本**
   - 实施落点：`packages/db/src/schema/`、`packages/api/src/features/profile/`、`apps/web/src/features/profile/`。
   - 关键验收：PDF/DOCX 导入（无文本层 PDF 走 Tesseract OCR 兜底）→ 用户校正确认后生成带稳定 ID 的事实版本；AI 不得回写主经历档案；完成后在主导航开放「我的经历」，并在 `packages/mcp` 同步暴露主经历只读 Resource。
3. **P3（F3）：岗位截图与描述导入**
   - 实施落点：`packages/api/src/features/applications/`、`apps/web/src/features/applications/`、BullMQ + Tesseract 5 worker。
   - 关键验收：支持最多 5 张截图/长图分片去重识别（视觉模型优先、本地 OCR 兜底）；原文未写信息保持为空、含糊内容标记待核对；同页确认后可「保存并生成简历」。
4. **P4（F4）：站内完整岗位简历定制**
   - 实施落点：`packages/api/src/features/tailoring/`、`packages/mcp`。
   - 关键验收：覆盖简介、技能、项目、实习与工作经历；每项建议绑定事实 ID 与版本，服务端校验受保护字段（公司、学校、学历、时间、数字不可篡改）；展示差异供用户接受并幂等创建新简历；退出旧的「仅重写简介」主入口，并同步升级 MCP 的 `tailor_resume_for_application` 工具与 `SKILL.md`。
5. **P5（F5/F6）：投递冻结快照与备份恢复交付**
   - 实施落点：`packages/db/src/schema/applications.ts`、`packages/api/src/features/applications/`、`tooling/deployment/`。
   - 关键验收：标记「已投递」时独立冻结简历数据与导出文件，删除工作简历不影响历史投递快照；提供完整的数据库+文件+密钥备份与全新环境恢复脚本，完成 10 份简历 + 20 份岗位真实样本验收。
