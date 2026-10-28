# 多平台生态接入与打包清单（WorkBuddy / Codex / ChatGPT）

本目录维护「求职管理（Career Workspace）」对外暴露的远程 MCP Server（`https://interview.unlimit.ltd/mcp`）在各 AI 客户端生态中的连接器清单与 `SKILL.md` 编排规范。

## 一、目录结构

```text
tooling/integrations/
├── README.md
├── workbuddy/
│   ├── connector-meta.json              # WorkBuddy 连接器元数据清单
│   ├── mcp.json                         # Streamable HTTP MCP 客户端配置模板
│   ├── icon.svg                         # 产品自有品牌图标
│   └── skills/
│       └── career-assistant/
│           └── SKILL.md                 # 求职助手核心工作流与事实红线规范
└── openai-plugin/
    ├── plugin.json                      # OpenAI / Codex 插件与连接器元数据清单
    ├── mcp.json                         # Streamable HTTP MCP 客户端配置模板
    └── skills/
        └── career-assistant/
            └── SKILL.md                 # 与 WorkBuddy 同源的求职助手 Skill 规范
```

## 二、服务端已就绪端点

| 能力 | 线上地址 |
| :--- | :--- |
| MCP Streamable HTTP 端点 | `https://interview.unlimit.ltd/mcp` |
| MCP Server Card（SEP-1649） | `https://interview.unlimit.ltd/.well-known/mcp/server-card.json` |
| OAuth 2.0 受保护资源元数据 | `https://interview.unlimit.ltd/.well-known/oauth-protected-resource` |
| OAuth 2.0 授权服务器元数据 | `https://interview.unlimit.ltd/.well-known/oauth-authorization-server` |
| OpenAPI 3 规范 | `https://interview.unlimit.ltd/api/openapi/spec.json` |
| 个人 API Key 创建入口 | `https://interview.unlimit.ltd/dashboard/settings/api-keys` |

## 三、本地联调与上架步骤

### 1. WorkBuddy 接入与提审

1. 登录 `https://interview.unlimit.ltd/dashboard/settings/api-keys`，点击「创建新 API 密钥」，复制生成的密钥。
2. 在本地客户端设置环境变量 `INTERVIEW_MANAGE_API_KEY=<你的密钥>`，或直接支持 OAuth 2.0 的连接器中走浏览器授权登录。
3. 在 WorkBuddy 开发者模式加载 `tooling/integrations/workbuddy/` 目录（包含 `connector-meta.json`、`mcp.json`、`icon.svg` 与 `skills/career-assistant/SKILL.md`）。
4. 验证以下核心链路：
   - 发送一段目标岗位 JD，确认助手调用 `list_resumes` + `read_resume` 完成真实经历对比与差距提示。
   - 要求保存岗位并定制简历，确认助手调用 `create_application`、`duplicate_resume`、`apply_resume_patch`、`download_resume_pdf` 返回 PDF 下载链接且未覆盖主简历。
5. 打包 `tooling/integrations/workbuddy/` 目录内容提交至 WorkBuddy 开放平台审核（临时打包产生的 `.zip` 文件验证后立即清理，不提交 Git）。

### 2. Codex / ChatGPT / 通用 MCP 客户端接入

1. 将 `tooling/integrations/openai-plugin/mcp.json` 中的 `mcpServers.interview-manage` 配置合并到客户端的 MCP 配置文件，并注入 `INTERVIEW_MANAGE_API_KEY` 环境变量（或使用 OAuth 2.0 授权）。
2. 将 `tooling/integrations/openai-plugin/skills/career-assistant/SKILL.md` 挂载为客户端 Skill 或自定义指令。
