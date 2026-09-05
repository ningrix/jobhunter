# 13 V3 Phase 2 验收报告（竞品借鉴落地四块）

> 验收时间：2026-09-03 · 验收方式：过夜自主 QA（边界测试 → 回归 → 类型检查 → Build → 浏览器冒烟 → 代码/安全/状态机审计 → 修复 → 再回归）

## 0. 范围

B1 AI 打招呼语（借鉴 get_jobs）· B2 验证码人工复检（借鉴 get_jobs）· B3 用户接管 Handover（借鉴 ai-job）· B4 阻断提醒联动（借鉴 ai-job）。合规红线不触碰：无协议逆向、无指纹伪装、无绕过验证码、无无人值守投递。

## 1. 最终验收结论

| 项 | 结论 | 证据 |
|---|---|---|
| B1 AI Greeting | **PASS** | useAI=false 行为与 V2 一致（template）；useAI=true 走 `runAI("generate_greeting")` JSON 管道，≤60 字（`GREETING_MAX_LENGTH`）；失败矩阵（限额/Provider 错误/非法 JSON/空响应/超长/空回复）全部降级 `template_fallback` 且 Agent Run 不失败；防幻觉断言：只含输入事实、经历段数取 work experience 不计 projects、不出现输入外公司/数字 |
| B2 CAPTCHA Recovery | **PASS** | 状态机 RUNNING → BLOCKED(captcha) → 人工完成 → 复检 → RUNNING / 保持 BLOCKED；`MAX_CAPTCHA_RESUMES=2`，第三次验证码即无法再复检（终态 blocked）；submitted/handed_over/重复调用 resolved 一律 7102 拒绝；绝不自动重试/绕过 |
| B3 User Handover | **PASS** | awaiting 与 captcha-blocked 均可接管 → `handed_over_to_user` 终态 + `driver.close()`；`user_handover` 事件（source=user，handoverReason）；接管后 confirm/resolved/handover 全部拒绝；只能走手动投递 |
| B4 Blocked Reminder | **PASS** | captcha/login 阻断自动建提醒（content 含 sessionId+jobId）；查重 userId+jobId+类型+pending；两类型提醒可并存；复检通过自动 done；`blocked_reminder_created` 事件留痕 |
| Tests | **177 / 177 PASS** | 基线 152 → 177（+25：失败矩阵/状态机/授权边界/并发/防幻觉）；未删除、未放松任何既有测试 |
| TypeScript | **PASS** | `npx tsc --noEmit` 0 错误 |
| Build | **PASS** | `npm run build` 成功 |
| Browser Smoke | **PASS** | 生产模式（npm start）真实浏览器：Agent→AI 生成徽标→确认提交→投递成功；captcha 阻断→提醒创建→「我已完成验证」→继续→提交成功→提醒自动关闭；captcha 阻断→「接管处理」→你已接管→提醒保留 |
| Security Audit | **PASS** | 会话绑定 userId，跨用户 confirm/resolved/handover/GET 均 7103 拒绝（测试覆盖）；跨用户职位/简历启动被 4001/3001 拦截；agent_events 与提醒内容不含任何凭证 |
| Regression | **PASS** | 每次修复后全量 test+tsc+build 复跑；旧测试零删除零放松（2 处断言更新为本次规范要求的新事件名，意图不变） |

## 2. 状态机（最终形态）

```
RUNNING ──captcha──▶ BLOCKED_CAPTCHA ──用户声明已验证──▶ 复检
   │                      │                              ├─ 仍在验证 ──▶ BLOCKED_CAPTCHA（剩余次数-1）
   │                      │                              └─ 已通过 ──▶ RUNNING（断点续跑）
   │                      └─ handover ──▶ HANDED_OVER_TO_USER（终态）
   ├──策略 REJECT──▶ BLOCKED（终态）
   ├──login_wall──▶ BLOCKED（终态，可建提醒）
   └─fill──▶ WAITING_CONFIRM ──approve──▶ SUBMITTED
                            ├──reject──▶ REJECTED_BY_USER（终态）
                            └──handover──▶ HANDED_OVER_TO_USER（终态）
```

非法转换全部拒绝（7102/7103）；确认与复检带同步状态占位，并发重复请求被拒（防双提交）。

## 3. 过程中发现并修复的问题

| # | 问题 | 修复 | 回归 |
|---|---|---|---|
| 1 | **dev 真 bug**：Next dev 按路由独立实例化共享模块，内存 `sessions` Map 跨路由不共享 → confirm 稳定 404（7103） | 会话表挂 `globalThis` 单例（同进程共享 + 抗 HMR 重置） | 全量 + 浏览器真实链路 |
| 2 | 并发确认竞态：双 confirm 可双提交 | confirm/resolved 同步状态占位 + 审计写入失败回滚 awaiting | `Promise.allSettled` 三并发测试：仅 1 次提交 |
| 3 | 提醒查重按 title（含职位名）粒度不足 | 改为 userId+jobId+类型+pending 四维查重 | CAPTCHA 与 LOGIN_WALL 并存测试 |
| 4 | handover 仅限 awaiting，安全验证阻断态无法接管（用户被卡死只能等待复检） | 抽出 `handoverRun` + 新路由 `/handover`，阻断态可接管；confirm(action=handover) 兼容保留 | 重复/非法状态接管拒绝测试 |
| 5 | 事件可追踪性不足 | 新增 `captcha_blocked`/`user_handover`/`blocked_reminder_created` 事件；`generate_content` 增加来源与降级原因 | 审计断言覆盖 |

## 4. 已知事项 / 限制

- 会话存于内存（单机单进程语义）；多实例部署需外置会话存储（留待生产化阶段）
- agent_events 表未纳入 resetDb 清理列表，测试隔离依赖 users 级联删除（现状正确，记录备查）
- Discovery 页存在并行的样式层重构（设计系统接入），本阶段已验证与 Agent 逻辑完全兼容（177 测试 + 冒烟在合并态通过）
- 冒烟用 mock-captcha 演示职位：`sourceUrl` 以 `mock-captcha://` 前缀（仅 MockDriver 生效）触发验证码场景，真实驱动不受影响

## 5. 建议下一步（按 Impact / Difficulty / Risk 排序）

1. **真实浏览器驱动（Level 1.5）**：本机已登录会话驱动 + 本阶段复检/接管/提醒内核 —— Impact 高 / Difficulty 高 / Risk 中（需逐平台合规评审）
2. **开源化准备**：README 英文化、LICENSE、脱敏 demo、架构图 —— Impact 高 / Difficulty 低 / Risk 低
3. **Application Tracker 增强（求职 CRM）**：高意向事件通知、每轮沟通提醒（ai-job 已验证的付费需求点）—— Impact 中 / Difficulty 中 / Risk 低
