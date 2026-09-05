# JobHunter — AI 求职操作系统

面向国内求职者的 AI 工作台：**简历工作台 × 职位智能匹配 × 投递进度管理**。

**项目亮点**

- **Browser Agent 半自动投递**：Agent 准备 → 用户确认 → 提交的 Level 1 流程，显式安全状态机（`RUNNING/BLOCKED_CAPTCHA/WAITING_CONFIRM/HANDED_OVER`），验证码绝不绕过、全链路 `agent_events` 审计留痕
- **Agent 安全边界**：不存平台凭证、人工复检有限次、用户可随时接管（Handover）、阻断自动联动站内提醒、失败逐级降级
- **可解释的匹配引擎**：规则评分器（加权点积）+ 用户自调权重向量（归一化、向后兼容）+ AI 结构化「优势/差距/风险」解读
- **AI 网关**：统一 LLM 接入，Mock Provider 离线可用，支持自带 OpenAI 兼容模型（GLM/DeepSeek/Qwen），日限额与用量计量
- **测试驱动**：208 个 Vitest 用例（27 个测试文件）覆盖状态机、授权边界、并发与防幻觉断言，TypeScript 0 错误

## 快速开始

```bash
npm install
npm run db:generate   # 生成数据库迁移（首次）
npm run db:seed       # 灌入演示数据（可选）
npm run dev           # http://localhost:3000
```

演示账号：`demo@jobhunter.cn` / `demo12345`

```bash
npm test              # 运行全部 208 个测试（Vitest，无需外部服务）
npm run build && npm start   # 生产构建与启动
```

## 功能总览

### V2：AI Job Hunter Agent 平台

| 模块 | 能力 | 文档 |
|---|---|---|
| Job Source 适配器架构 | 统一 JobSource 接口（能力模型/健康检查/失败隔离）、BOSS 辅助导入（无公开 API，不虚构）、统一 UnifiedJob 归一化、确定性指纹 + 三级去重（EXACT/POSSIBLE/NEW） | [08](docs/08-job-source-architecture.md) |
| Browser Agent | 驱动抽象 + MockDriver（登录墙/验证码场景）、Level 1 半自动投递（Agent 准备→用户确认→提交）、AI 打招呼语（可选，失败降级模板）、验证码人工复检闭环、全链路 agent_events 审计 | [09](docs/09-browser-agent.md) |
| 投递策略引擎 | 城市岗位薪资学历经验黑名单白名单匹配分每日上限；ALLOW/需确认/REJECT 三态；手动与自动双语义 | [10](docs/10-application-policy.md) |
| Agent 安全边界 | 不绕过验证码登录、不存平台凭证、用户控制权锚点、优雅降级链；安全验证人工复检（有限次）、用户接管 Handover、阻断联动站内提醒 | [11](docs/11-agent-security.md) |
| Level 0 推荐流 | 批量规则匹配 → 强烈推荐(≥85)/推荐(70-85)/待确认/已投递 分桶 | — |
| AI 匹配解读升级 | 规则评分不变，AI 输出结构化「优势/差距/风险」 | — |
| Agent 投递漏斗 | Dashboard：发现岗位→符合条件→推荐→用户确认→投递→面试→Offer | — |

### V3：竞品借鉴与个性化

| 模块 | 能力 |
|---|---|
| AI 打招呼语 | 结构化 JSON 管道生成（≤60 字），失败矩阵全降级模板，防幻觉断言（只含输入事实） |
| 验证码人工复检 | BLOCKED_CAPTCHA → 用户声明 → 复检 → 断点续跑；有限次（`MAX_CAPTCHA_RESUMES=2`），绝不自动重试 |
| 用户接管 Handover | awaiting / captcha-blocked 均可接管，终态化 + 资源释放，接管后仅可手动投递 |
| 阻断提醒联动 | captcha/login 阻断自动建站内提醒（查重），复检通过自动关闭 |
| 匹配权重向量 | 用户自调五维权重（加权点积 + 归一化），非法/缺省维度回落系统默认，输出确定性 |
| 自带 AI 模型 | 设置页配置 OpenAI 兼容端点（含连接测试），密钥加密存储，不落明文 |

### V1（MVP）

| 模块 | 能力 |
|---|---|
| 用户中心 | 注册/登录（JWT + 刷新令牌轮换）、求职画像（期望职位/城市/薪资） |
| 简历工作台 | 新建/上传解析（txt/md/pdf/docx → AI 结构化）、多版本管理、主简历、AI 诊断评分与优化建议（采纳需确认） |
| 职位中心 | 粘贴 JD → AI 结构化解析、公司自动建档、收藏、关键字搜索 |
| 智能匹配 | 规则评分器（技能 40% / 经验 25% / 学历 15% / 城市 10% / 薪资 10%）+ 差距清单 + AI 解读 |
| 投递看板 | 想投→已投递→笔试→面试→Offer/已挂 流水线（合法流转校验）、事件时间线、跟进备注 |
| 提醒 | 站内提醒、到期清单、完成/忽略 |
| 数据看板 | 投递漏斗、各阶段分布、近 8 周趋势、待办概览 |
| AI 网关 | 统一 LLM 接入：Mock Provider（离线可用）/ OpenAI 兼容 Provider（GLM/DeepSeek 等），日限额、用量计量、异步任务轮询 |

## 环境变量（.env）

| 变量 | 说明 |
|---|---|
| `DB_PATH` | SQLite 文件路径，默认 `./data/jobhunter.db` |
| `JWT_SECRET` | JWT 签名密钥（生产必须更换） |
| `AI_PROVIDER` | `mock`（默认，离线）或 `openai`（OpenAI 兼容端点） |
| `AI_DAILY_LIMIT` | 单用户每日 AI 调用上限，默认 200 |
| `AI_OPENAI_BASE_URL` / `AI_OPENAI_API_KEY` / `AI_OPENAI_MODEL` | 接入 GLM/DeepSeek/Qwen 等兼容 API |

## 文档

- [01 产品需求（PRD）](docs/01-产品需求-PRD.md)
- [02 技术架构](docs/02-技术架构.md)
- [03 数据库设计](docs/03-数据库设计.md)
- [04 API 设计](docs/04-API设计.md)
- [05 目录结构](docs/05-目录结构.md)
- [06 开发计划](docs/06-开发计划.md)
- [07 风险评估](docs/07-风险评估.md)
- [08 Job Source 架构（V2）](docs/08-job-source-architecture.md)
- [09 Browser Agent（V2）](docs/09-browser-agent.md)
- [10 Application Policy（V2）](docs/10-application-policy.md)
- [11 Agent 安全边界（V2）](docs/11-agent-security.md)
- [12 V2 测试报告](docs/12-v2-test-report.md)
- [13 V3 Phase 2 验收报告](docs/13-v3-phase2-test-report.md)

## 技术栈

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Drizzle ORM + SQLite（生产可切 PostgreSQL）· jose (JWT) · bcryptjs · Zod · Vitest（208 用例 / 27 个测试文件）
