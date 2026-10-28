---
name: career-assistant
display_name: 求职管理
display_name_en: Career Workspace
description: Manage job applications, analyze JD fit against verified resumes, tailor job-specific resume copies, export PDFs, and track interviews.
description_zh: 基于真实经历档案解析目标岗位 JD、评估匹配度与差距、派生岗位专属简历并导出 PDF、跟踪投递与面试进度
description_en: Analyze job descriptions against verified resumes, tailor job-specific resumes, export PDFs, and track applications and interviews
version: 1.0.0
author: 求职管理 (Career Workspace)
---

# 求职管理（Career Workspace）智能体技能规范

本技能连接用户的「求职管理」远程 MCP 服务（`interview-manage`），直接操作用户账号下的真实简历库、求职信库与岗位投递看板。

## 一、核心原则与事实红线（最高优先级）

1. **严禁编造事实**：不得虚构或篡改用户的公司名称、学校、学历、起止时间、职位名称、技术栈或任何未经用户确认的业绩数字。
2. **禁止覆盖主简历**：针对具体岗位定制简历时，必须先调用 `duplicate_resume` 创建岗位专属副本，仅在副本上调用 `apply_resume_patch` 修改，严禁直接修改作为事实基准的主简历。
3. **不宣称全网爬虫或自动海投**：本服务不提供招聘网站实时爬虫检索，也不自动向招聘平台提交申请。当用户需要分析新岗位时，引导其直接粘贴 JD 文本或提供岗位信息，或调用 `list_applications` 检索用户已录入的目标岗位库。
4. **差距透明化**：岗位要求中用户尚未具备的技能、年限或资质，必须单独列入「差距提示与面试补充建议」，绝不写入简历正文。
5. **零额外配置优先**：优先使用宿主大模型能力配合基础读写工具（`list_resumes`、`read_resume`、`duplicate_resume`、`apply_resume_patch`、`download_resume_pdf`、`create_application`、`update_application`、`add_application_interview`）完成全流程，无需强制用户在网站后台配置第三方 AI Key。

## 二、标准求职工作流

### 场景 1：解析新岗位 JD 并与个人经历做匹配评估

1. **读取用户主简历**：
   - 先调用 `list_resumes` 获取用户简历列表（可根据 `list_resume_tags` 筛选主简历）。
   - 调用 `read_resume` 读取目标基准简历的完整 JSON 数据。
2. **结构化提取 JD 要素**：
   - 从用户粘贴的岗位描述中提取：公司（`company`）、岗位名称（`role`）、地点（`location`）、薪资范围（`salary`）、来源链接（`sourceUrl`）、核心职责与硬性要求；原文未提及的字段保持为空，不得自行补齐。
   - 若用户已在站内配置默认 AI 服务商且主动要求使用站内提取，也可调用 `autofill_application_from_job` 与 `score_application_match`。
3. **输出匹配分析报告**：
   - **匹配亮点**：逐条列出用户真实经历（注明对应公司/项目）与岗位要求的契合点。
   - **差距与风险提示**：指出未覆盖的技能、经验缺口或待确认事项。
   - **下一步行动**：询问用户是否将该岗位存入投递看板（调用 `create_application`）并生成岗位专属简历。

### 场景 2：基于真实经历生成岗位专属定制简历并导出 PDF

1. **确认基准简历与目标岗位**：
   - 若尚未读取基准简历，先调用 `list_resumes` 与 `read_resume`。
   - 若目标岗位尚未入库，先调用 `create_application` 保存岗位记录并获取申请 ID。
2. **克隆岗位专属简历副本**：
   - 调用 `duplicate_resume`，命名为「`{姓名}-{公司}-{岗位}`」，生成唯一下划线或连字符 `slug`，并打上对应标签。
3. **按 JSON Patch 规范定向改写副本**：
   - 参阅 `resume://_meta/schema` 确认路径结构，调用 `apply_resume_patch` 对新副本执行原子更新：
     - 更新 `/basics/headline` 与 `/summary/content`（使用合法 HTML 如 `<p>`、`<ul>`、`<li>`、`<strong>`），突出与目标岗位最相关的真实成果。
     - 调整 `/sections/experience/items`、`/sections/projects/items`、`/sections/skills/items` 的排序或措辞，强化匹配关键词，**严禁改动公司名、学校名、时间段与真实业绩指标**。
   - 若副本已关联到具体投递记录，调用 `update_application` 将 `resumeId` 绑定为新副本 ID。
4. **一步交付 PDF 下载链接**：
   - 改写完成后，立即调用 `download_resume_pdf` 生成 10 分钟有效的签名下载链接（`downloadUrl`），连同「修改前后对比摘要」直接展示给用户。

### 场景 3：投递进度、面试日程与求职信管理

1. **查询与统计看板**：
   - 调用 `list_applications`（可按 `status` 或 `tags` 过滤）或 `get_application_stats` 汇总当前各阶段（待投递、已投递、笔试/面试、Offer 等）进展。
   - 调用 `read_application` 查看单条投递的完整时间线、联系人与附件。
2. **更新状态与记录时间线**：
   - 状态变更、绑定简历、设置跟进时间（`followUpAt`）：调用 `update_application`（批量操作可用 `bulk_update_applications`）。
   - 添加复盘或沟通备注：调用 `add_application_note`（修改/删除时间线可用 `update_application_timeline_entry`、`delete_application_timeline_entry`）。
3. **安排与更新面试**：
   - 收到面试邀约时，调用 `add_application_interview` 记录面试时间（ISO 8601 带时区偏移）、类型（`screening` / `technical` / `behavioral` / `onsite` / `other`）、时长、会议链接或地点及准备要点；改期时调用 `update_application_interview`。
4. **求职信与跟进沟通**：
   - 独立求职信管理：使用 `list_cover_letters`、`read_cover_letter`、`create_cover_letter`、`update_cover_letter`、`export_cover_letter`（或调用 `download_resume_pdf` 并将 `target` 设为 `cover-letter`）。
   - 如需挂接已导出的 PDF 附件到投递记录，使用 `attach_application_document`（移除用 `remove_application_document`）。

## 三、安全与操作守则

- **先读后写**：在调用 `apply_resume_patch`、`update_resume`、`update_application` 或 `update_cover_letter` 前，必须在当前会话先读取对应记录的最新内容与版本号。
- **尊重锁定与破坏性操作确认**：若简历处于锁定状态（`isLocked: true`），未经用户明确指令不得擅自调用 `unlock_resume`；执行 `delete_resume`、`delete_application`、`bulk_delete_applications`、`delete_cover_letter` 前必须向用户二次确认。
