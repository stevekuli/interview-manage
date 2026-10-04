# 2026-10-04 服务器部署验收（P0 基线上公网）

状态：已完成并验证。目标：把 P0 基线应用部署到阿里云 ECS 公网可访问。

## 拓扑与入口

- 服务器：Aliyun ECS `i-7xv9ana73k8rrat6cfqd`（8.148.199.165，广州，2C/2G，root SSH 密钥见 `connect-server` skill）。
- 公网入口：`http://8.148.199.165:3012`（Nginx 3012 端口反代 → `127.0.0.1:3001` → app 容器 3000）。
- 域名：`unlimit.ltd` 无泛解析，新子域名需在 DNSPod 加记录（本会话无凭据）；拿到后在该 nginx server 块追加 `server_name` 并上 443+TLS 即可。
- 部署目录：`/opt/interview-manage/`（`compose.yml` + `.env`，密钥仅存服务器，权限 600）。
- 栈：隔离 compose 项目 `interview-manage`（postgres:15 + redis:latest + app:1.65GB 镜像 `interview-manage:20261004`），全部 healthy。不复用 new-api 项目的 postgres/redis。
- 部署文件源码：`tooling/deployment/server/`（compose.yml、nginx-interview-manage.conf、.env.example）。服务器上的 compose 与仓库一致。

## 传输与构建决策

- 本机 Docker Desktop 构建（Dockerfile 多阶段，构建于本地而非 2G 内存服务器），`docker save | gzip` = 296MB。
- SSH 大流量在"本机代理出口 → 服务器"路径上被 DPI 间歇掐断（交互命令正常、批量必死、HTTP 大流量也受影响），原始管道与 scp 均失败。
- 最终通道：SSH `tail -c +N | ssh "cat >>"` 追加式断点续传（296MB 成功，sha256 双端一致 `5212e560fe...46da`）。
- 备用通道：阿里云 OpenAPI `ecs RunCommand`（云助手）——deploy RAM 子账号（profile `deploy`）有 ECS/VPC/DNS/OSS 权限，SSH 完全不可达时用它执行任意 root 命令。OSS 未开通（UserDisable），服务器无公网出口（DNS 仅 AAAA、无 v6 路由），第三方匿名网盘中转均不可达。

## 服务器侧适配（与上游默认的差异）

1. **出站代理**：宿主机无 v4 直连出口，字体 CDN（jsdelivr/gstatic）在 PDF 渲染时在线拉取会 500。app 容器设置 `NODE_USE_ENV_PROXY=1` + `HTTP(S)_PROXY=http://host.docker.internal:7890`（复用宿主机既有 mihomo），`NO_PROXY` 排除自指与内部服务。已在实测中使公开 PDF 恢复 200。
2. **镜像版本**：postgres:15、redis:latest 用服务器已有镜像（无公网拉取能力）；上游默认 postgres:16-alpine/redis:7-alpine 需等有出口后再升级。
3. **SSHD**（既有状态被本次修改，回滚见下）：原 Ubuntu 26.04 默认 `ssh.socket` 激活；因排查传输问题切换为经典模式 `ssh.service`（`systemctl disable --now ssh.socket; systemctl enable ssh.service`），并在 `/etc/ssh/sshd_config` 追加 `Port 22` + `Port 2222`（备份 `sshd_config.bak-20261004`）。2222 用于路径劣化时的备用入口。
4. **Nginx**：仅新增 `sites-enabled/interview-manage`（3012 default_server，gzip、client_max_body_size 64m、SSE 友好 proxy_buffering off、超时 600s），未改动既有站点（unlimit.ltd、date.chipniq.com、api-gateway、financial-management）。

## 验证记录（2026-10-04 实测）

- `docker compose ps`：app/postgres/redis 全部 healthy；`/api/health` 显示 database/storage/redis 均 healthy。
- 官方冒烟 `tooling/deployment/smoke.mjs` 在服务器容器网络内对 nginx 3012 完整通过：**Pages, auth, resume CRUD, public PDF, 10 MiB upload/download: passed**（含注册、登录、简历增改查、公开页、服务端 PDF、10MiB 上传下载，测试账号自清理）。
- PDF 探针：两次渲染均 200（65821 字节、%PDF 头），1.2s / 4.1s。
- 公网探测（本机）：`/api/health`、`/robots.txt` 200（0.03s）；首页/登录页 200 但本机代理链路下偶发慢/截断——服务器本机同页面毫秒级，判定为我的测量链路问题，非部署问题。真实用户直连阿里云广州不受影响。
- 迁移：应用启动时自动执行，日志 `Database migrations completed`。

## 已知限制与风险

- **安全组对 0.0.0.0/0 全端口放行**（既有状态，2026-09-21 创建）：3012 已被扫描器持续探测（协议杂音轰炸，nginx 返回 400 正常拒绝）。强烈建议收紧为 22/80/443/3011/3012/3389。
- 出口带宽 3 Mbps：SPA 首载资源较大，公网首开可能数秒。
- hairpin（服务器自连自己公网 IP）不可靠：阿里云经典公网 IP 已知限制，测试一律用 `127.0.0.1:3012`，不要用公网 IP 自测。
- 字体走 mihomo 出口：mihomo 故障时 PDF 渲染会 500（ECONNRESET 抖动重试即恢复）。长期方案：镜像字体到 nginx 本地托管（`packages/fonts/src/webfontlist.json` 共 3268 个文件，508 字体族），或在构建时 bake 进镜像并改写 URL。
- APP_URL 目前是 IP:port，换域名时需同步 `.env` 的 `APP_URL` 并 `docker compose up -d`。
- e2e 用的 `FLAG_DISABLE_API_RATE_LIMIT` 未设置（生产保持限流开启）。

## 回滚路径

- 应用栈：`cd /opt/interview-manage && docker compose down`（数据卷 `interview-manage_*` 保留；彻底清除加 `-v`）。
- Nginx：`rm /etc/nginx/sites-enabled/interview-manage && nginx -t && systemctl reload nginx`（返回原状态：无本应用入口）。
- SSHD 回滚：`systemctl disable --now ssh.service && systemctl enable --now ssh.socket && systemctl daemon-reload`，并从 `/etc/ssh/sshd_config` 删除追加的两行 Port（备份在同目录 `.bak-20261004`）。
- 镜像回滚：重新部署旧版本 = 构建新 tag 的镜像走同一流程；当前镜像 tag `interview-manage:20261004`（同 `latest`）。
- 数据库回滚：当前无存量业务数据（内测未开始），直接删卷重建即可；有数据后必须先 `pg_dump`。

## 下次部署 SOP（要点）

1. 本机构建 `docker build -t interview-manage:<date> .` → `docker save | gzip`。
2. 传输优先 SSH 2222 追加续传（`tail -c +N | ssh -p 2222 "cat >>"` 循环），校验 sha256；SSH 全断时改云助手 + 服务器可拉取的源。
3. 更新 `/opt/interview-manage/compose.yml`（tag）→ `docker compose up -d` → 等待 healthy。
4. 冒烟：容器网络内对 `http://127.0.0.1:3012` 跑 smoke.mjs（APP_URL 需与 SMOKE_URL origin 一致，参考本次 flip 做法）。
