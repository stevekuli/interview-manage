# 2026-10-05 品牌版本部署验收（20261005 上公网）

状态：已完成并验证。目标：把品牌整理后的应用（`5a32dee feat(branding)`，镜像 tag `interview-manage:20261005`）部署到公网，替换 `20261004`。

## 部署结果

- 公网入口 `http://8.148.199.165:3012` 正常：`/api/health` 200（0.28s，database/storage/redis 均 healthy）；首页初始 HTML 标题已是"求职管理 — 把岗位、简历和投递进度放在一起"；`/llms.txt`、`/robots.txt` 均为本产品身份。
- 官方冒烟 `tooling/deployment/smoke.mjs`（APP_URL 翻转为 `http://127.0.0.1:3012` 后在容器内以 host 网络执行，SMOKE_URL 同 origin）：**Pages, auth, resume CRUD, public PDF, 10 MiB upload/download: passed**，测试账号自清理；冒烟后 APP_URL 已翻回公网地址并确认 healthy。
- 数据库：无表结构变更（品牌阶段不改表）；应用启动自动迁移正常，postgres 数据卷沿用。

## 部署方式与链路实况（与上次 SOP 的差异）

1. **整镜像传输通道失效**：本机到服务器的 TCP（22/2222 端口、公网 HTTP）本轮被链路间歇完全掐断，`docker save | gzip` 的 296MB 整镜像多次断点续传 0 字节落地；ICMP 与阿里云 OpenAPI HTTPS 不受影响（本机出口对该服务器 IP 的针对性抖动，服务器本体健康）。
2. **改用 dist 增量补丁（本次实际路径，建议纳入 SOP）**：本轮改动全部在构建产物内、外部运行时依赖未变，因此只传输 `apps/web/dist + apps/server/dist` 的 gzip 包（15MB），在服务器上基于旧镜像 `docker create → docker cp → docker commit` 生成 `interview-manage:20261005`（1.71GB，独占层 312MB），`compose.yml` 改 tag 后 `up -d`。适用前提：依赖树与 migrations 未变（需先核对 lockfile 与 `migrations/` diff）；否则仍走整镜像。
3. 15MB 增量用 10 路并行分片断点续传传完（每片独立续传，拼接后 sha256 双端一致 `5d50761e…eda62`）；期间两片（part3/part7）内容被链路损坏，通过分片 sha256 比对定位后单片重传修复。**教训：分片拼接后必须整体 sha256 校验，且校验失败要逐片比对，不能整包重传。**
4. `pkill -f` 的匹配串出现在自己远端命令行时会自杀（本次曾导致远端脚本上传 0 字节），远程清理进程用 `pkill -f 'smoke[.]mjs'` 这类括号正则规避。
5. SSH 长连接在链路劣化时会挂死，远程长任务一律 `nohup … > log 2>&1 < /dev/null &` 落盘后短连接轮询；分离命令里 `< localfile` 管道喂 stdin 会被会话关闭截断（0 字节文件），必须先同步 `cat > file` 上传、再分离执行。
6. 阿里云云助手通道本轮不可用：实例上 aliyun-service agent 未运行（`RunCommand` 返回 "The aliyun service is not running on the instance"）。SSH 恢复后建议 `systemctl enable --now aliyun-service` 重建该备援通道（本次未做，待办）。
7. 阿里云 CLI 的 `ecs RunCommand` 数组参数写法：`--InstanceId.1 i-xxx`（JSON 数组写法会报 MissingParam.InstanceId）。

## 事故与处置：mihomo 容器日志 29GB 撑爆磁盘

- 部署过程中 postgres 进入 recovery 循环，`PANIC: could not write to file "pg_logical/replorigin_checkpoint.tmp": No space left on device`；根因是 `mihomo` 容器的 json-log 累积到 29GB（磁盘原已 94%），本轮新增镜像与传输文件把剩余 2.5G 耗尽。
- 处置：`truncate -s 0` 该日志（容器不重启，mihomo 功能未中断），磁盘回到 25%；postgres 随下一个重启周期自行完成 recovery，全栈恢复 healthy。
- 预防：已添加 `/etc/logrotate.d/docker-containers`（50MB 上限、保留 3 份、compress、copytruncate）。
- 数据安全：pgdata 卷未受损，recovery 正常完成；未发生数据丢失。

## 当前服务器状态（验收时点）

- `docker ps`：app（20261005，healthy）/ postgres:15（healthy）/ redis（healthy）；旧镜像 `interview-manage:20261004` 保留作为回滚点（compose tag 改回即可回退，无表结构差异）。
- 磁盘：40G 中已用 9.3G（25%）。
- 临时文件已清理（delta 分片、incoming tar、patch 目录、flip 脚本与日志）；`/opt/interview-manage/smoke.mjs` 保留备下次冒烟。

## 待办与建议

1. **重建云助手 agent**：`systemctl enable --now aliyun-service`（SSH 恢复后执行），恢复最后备援通道。
2. mihomo 日志根因：logrotate 只是兜底，建议排查 mihomo 为何产生 29GB 日志（大概率是公网 0.0.0.0/0 全端口扫描噪音穿透其日志级别），必要时调整其日志级别或改用 `local` 日志驱动。
3. 安全组收紧（沿用 2026-10-04 记录的建议）：仅放行 22/80/443/3011/3012/3389。
4. 镜像 LABEL 仍是上游 Reactive Resume 元数据（docker inspect 可见），不影响站点展示；下次整镜像构建时改 Dockerfile LABEL。
