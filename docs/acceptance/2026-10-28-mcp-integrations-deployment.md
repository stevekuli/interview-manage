# 2026-10-28 MCP 生态接入上线部署验收记录

- 对应计划：`docs/plans/2026-10-28-mcp-integrations-and-next-phases.md`（S1 + S2 阶段）
- 部署目标：`https://interview.unlimit.ltd`（Nginx 443 → 127.0.0.1:3001 → 容器 3000）
- 结论：**部署成功，全部验收项通过**（含一次线上出站代理事故的定位与修复，见下文）。

## S1 本地验证与分批提交（全部真实验证通过）

| 验证项 | 结果 |
| :--- | :--- |
| Node / pnpm | v24.9.0 / 12.6.0 |
| `pnpm-lock.yaml`、`migrations/` 无未提交变更 | 满足增量补丁前提 |
| `@reactive-resume/auth` 单测（`.env` 临时移走后运行，结束已恢复） | 6 文件 31 用例通过 |
| `@reactive-resume/mcp` 单测 | 6 文件 72 用例通过（含 `integrations.test.ts` 6 用例、`mcp-server-card.test.ts` 19 用例） |
| web 定向单测（`error-message`、`brand-promo-remnants`） | 33 用例通过 |
| `pnpm typecheck` | 19 任务全部成功 |
| `pnpm exec turbo boundaries` | 1120 文件无违规 |
| `pnpm --filter web build` / `--filter server build` | 均成功（web 1m36s） |
| `markdownlint-cli2`（AGENTS.md、tooling/integrations、本计划） | 124 文件 0 问题 |
| `git diff --check` | 干净 |

分批提交（未 push，遵循不自动 push 约定）：

- `13711c2` `feat(auth): support TRUSTED_ORIGINS and localize auth error messages`（Batch A，70 文件 +3319/-23）
- `08e4348` `feat(mcp): unify server card brand identity and add WorkBuddy/OpenAI integration manifests`（Batch B）

## S2 线上增量补丁部署

### 部署前状态

- 磁盘：40G 用 11G（27G 可用）；`/etc/logrotate.d/docker-containers` 在位。
- 运行镜像：`interview-manage:20261005`（healthy）；`20261004`/`20261005` 均保留为回滚点。

### 补丁制作与传输

- `tar -czf dist-patch-20261028.tar.gz apps/web/dist apps/server/dist`（web dist 35M + server dist 2.0M，压缩后 14.2MB）。
- 本轮 scp 直传一次成功（未触发分片续传）；sha256 双端一致：
  `ffa0b52ce125b6517cd37730395c0da79a224f4bcdab9bf514dda5749cf90fb1`
- 容器内 `index.html` 与本机构建产物 sha256 一致（`c85a2ff4…31162a`）。

### 镜像与切换

- 服务器解压 → `docker create --name patch-tmp interview-manage:20261005` → `tar -C … -cf - apps | docker cp - patch-tmp:/app`（diff：153 新增 / 223 变更）→ `docker commit --change 'USER node' --change 'WORKDIR /app' --change 'CMD ["node","apps/server/dist/index.mjs"]'` → `interview-manage:20261028`（1.75GB，`ece16720…`）。
- `compose.yml` tag 切换 `20261005 → 20261028`（修改前备份 `compose.yml.bak-20261028`），`docker compose up -d app`；启动日志显示自动迁移正常完成。

### 验收结果（全部真实验证）

| 检查项 | 结果 |
| :--- | :--- |
| `https://interview.unlimit.ltd/api/health` | HTTP 200；database（18ms）/ storage（local）/ redis（3ms）全 healthy |
| `/.well-known/mcp/server-card.json` | `serverInfo.name = "interview-manage"`；`serverInfo.title = "求职管理"`；`tools` 共 **44** 个 |
| server-card 品牌残留 | 无 `rxresu.me`；`reactive-resume` 仅出现于 `download_resume_*` 工具入参 `format.const = "reactive-resume-cover-letter"`（文档格式兼容标识，非展示文案，允许保留） |
| 首页 | 标题 `求职管理 — 把岗位、简历和投递进度放在一起`；`/llms.txt`、`/auth/login` 200；旧入口 `IP:3012` 301 跳转主入口 |
| 官方冒烟 `smoke.mjs`（新镜像容器 + host 网络 + `SMOKE_URL=https://interview.unlimit.ltd` 与 APP_URL 同 origin） | **Pages, auth, resume CRUD, public PDF, 10 MiB upload/download: passed**；测试账号自清理；exit 0 |

## 事故与处置：线上 PDF 渲染 500（首次冒烟失败）

1. **现象**：首次冒烟在「public resume PDF」断言失败（HTTP 500: Failed to generate public resume PDF），其余用例通过、账号自清理正常。
2. **根因链**（app 容器日志 + 宿主机排查）：
   - 直接原因：PDF 渲染下载字体走 `HTTPS_PROXY=http://host.docker.internal:7890`（mihomo），连接 `ECONNREFUSED`；
   - mihomo 容器**僵死**：`docker ps` 显示 Up 3 weeks，但 `docker top` 无进程、7890 无监听（与 2026-10-04 记录的 mihomo 日志顽疾同源）；`docker restart mihomo` 后进程与 7890 监听恢复；
   - 深层原因：mihomo 上游 hysteria2 订阅节点**全部认证失败（405）**，代理出站仍不可用；`fonts.googleapis.com` 直连超时（被墙）。
3. **修复**：实测宿主机直连 `fonts.gstatic.com`（TLS 证书为 Google Trust Services 签发，非劫持）与 `cdn.jsdelivr.net` 均可达——`packages/fonts/src/webfontlist.json` 的字体源仅这两个域。将两者加入 app 服务 `NO_PROXY`（`docker compose up -d app` 重建生效），字体下载改直连，不再依赖 mihomo 上游。
4. **验证**：重建后冒烟全绿（见上表）。本地 `tooling/deployment/server/compose.yml` 已同步该 NO_PROXY 与注释（本次提交），防止下次部署回退。
5. **遗留影响**：mihomo 订阅仍失效——app 的其他出站流量（如自定义 AI provider baseURL 调用、`fonts.googleapis.com`）仍会失败，需用户更新 mihomo 订阅凭据；本次未动订阅配置。

## S3 MCP 端到端验收（真实线上环境）

### 测试账号与凭据

- 合成测试账号 `mcp-e2e-1793187264542@example.com`（API 注册，含样本数据简历「基准简历（测试）」）；API Key 经 Better Auth `api-key/create` 创建，仅存本机 `artifacts/mcp-e2e-credentials.json`（git-ignored），未进版本库。
- 准备过程中两个脚本中断产生的孤儿账号已从数据库删除（`DELETE 2`，全部外键 `ON DELETE CASCADE`，先查后删）；主测试账号保留供 WorkBuddy/Codex 真机联调。

### MCP 协议层验证（Streamable HTTP，等价 Codex 客户端行为）

- `initialize`：`serverInfo.name = "interview-manage"`、`title = "求职管理"`、protocol `2025-03-26` ✓
- `tools/list`：44 个工具 ✓

### 5 步工作流（全部真实验证，`ALL 10 CHECKS PASSED`）

| 步骤 | 结果 |
| :--- | :--- |
| 1 读取基准简历 | `list_resumes` + `read_resume` 返回真实经历（Cascade Studios, March 2022 - Present, headline 完整）✓ |
| 2 差距分析素材 | 服务端数据足以区分「已覆盖（Python）」与「差距（Go/Kubernetes/vLLM/Redis/PostgreSQL）」；差距仅提示不编造是 SKILL.md 对客户端 AI 的约束 ✓ |
| 3 克隆与定向改写 | `duplicate_resume` 建副本 → `apply_resume_patch` 改副本 headline 成功；**原主简历 headline/company/summary 复核未变** ✓；受保护字段探测：副本上公司名可被改写（P4 前无服务端护栏，符合主计划预期，P4 交付「受保护字段服务端校验」） |
| 4 PDF 一步交付 | `download_resume_pdf` 返回带 token 的 `downloadUrl`；下载 HTTP 200、64.9 KiB、`%PDF` 魔数 ✓ |
| 5 投递与面试记录 | `create_application`（绑定副本 resumeId）→ `update_application`（status=interview）→ `add_application_interview`（技术面 60 分钟）全部成功 ✓ |

### 事故与处置：私有简历 PDF 渲染 500（长驻进程网络状态残留）

- 现象：NO_PROXY 修复并重启后，公开 PDF（冒烟）通过，但 MCP 私有简历 PDF 连续 500；日志为 `fonts.gstatic.com:443` undici `ConnectTimeoutError`（10s）。
- 排查：容器内单次 fetch 6/6、并发 12 fetch 12/12 全部成功（含默认与 ipv4first DNS 顺序）——网络本身正常，仅长驻主进程失败。
- 处置：`docker restart interview-manage-app-1` 后 PDF 立即恢复（200）。定性为**长驻进程在先前 mihomo 故障期的连接/dispatcher 状态残留**，重启即恢复；已保留 `NODE_OPTIONS=--dns-result-order=ipv4first`（本地 compose 已同步提交）作为防御。若再现，先重启 app 容器再排查。
- 遗留观察项：mihomo 上游订阅仍 405 失效；依赖代理的其他出站（自定义 AI provider baseURL 等）在订阅更新前不可用。

### WorkBuddy 打包与提审状态

- 连接器包已制作：`artifacts/workbuddy-connector-20261028.zip`（connector-meta.json、mcp.json、icon.svg、SKILL.md，共 5 项；artifacts/ 为 git-ignored，`git status --short` 无 zip 遗留）。
- 2026-10-28 上架前合规修正（用户决定跳过客户端真机联调、直接上架后执行）：`connector-meta.json` `description_en` 与两份 `SKILL.md` frontmatter 中 "verified experience / verified resumes / 真实经历档案" 措辞指向未实现的 P2 事实版本系统，已统一改为 "your existing resume / job-specific resume copies / 你的真实简历"——描述当前真实能力（基于主简历克隆副本定向改写）；SKILL.md 正文「用户真实经历（不编造）」语义准确保留。修正后 mcp 单测 72 全过（防漂移契约未破）、markdownlint 0 问题，zip 已重新打包。
- 端点合规核验（上架前复核）：connector-meta 宣称的 4 个 URL 全部在线（MCP 端点、server-card、两个 OAuth 元数据端点 200；未认证 MCP 请求正确 401）；SKILL.md 引用的 31 个工具与线上 44 工具清单逐一比对，零缺失、零虚构。
- **由用户执行**：WorkBuddy 开放平台上传 `artifacts/workbuddy-connector-20261028.zip` 提审（需用户账号）；客户端真机联调按用户 2026-10-28 决定跳过（服务端 5 步链路已全绿替代验证；测试账号凭据见 `artifacts/mcp-e2e-credentials.json` 备后用）。

## 回滚方式

- 镜像回滚：`/opt/interview-manage/compose.yml` 的 app tag 改回 `interview-manage:20261005` + `docker compose up -d app`（无表结构差异；NO_PROXY 变更独立于镜像层，可保留）。
- compose 回滚备份：服务器 `/opt/interview-manage/compose.yml.bak-20261028`。

## 临时文件清理

- 已删：本机与服务器补丁包、服务器解压目录 `/tmp/patch-20261028`、校验临时文件、冒烟日志、`/tmp/fontcss.txt`。
- 保留：`/opt/interview-manage/smoke.mjs`（备下次冒烟）、`compose.yml.bak-20261028`（回滚备份）。

## 待办与建议

1. **更新 mihomo 订阅**：上游节点 405 认证失败，恢复后可考虑回收 NO_PROXY 的字体域名（也可维持直连，减少代理依赖）。
2. mihomo 僵死（容器 Up 但进程消失）建议排查：容器 restart policy 未能拉起僵尸进程，必要时改用 `local` 日志驱动并加健康检查。
3. 沿用 2026-10-05 待办：`systemctl enable --now aliyun-service` 重建云助手备援通道；安全组收紧建议不变。
