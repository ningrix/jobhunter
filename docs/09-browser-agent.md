# 09 Browser Agent（V2）

## 1. 设计原则

- **驱动抽象，不绑死实现**：Agent 的页面操作全部经由 `BrowserDriver` 接口（open / currentPage / clickApply / extractJob / readForm / fillForm / submit / screenshot? / close）。
- **项目无 Playwright 依赖，不盲目新增**：当前实现 `MockBrowserDriver`（内存状态机模拟招聘站），用于 CI 测试与产品演示；真实「本地用户浏览器驱动」为后续扩展，默认关闭（`AGENT_DRIVER=mock`，设为其他值即抛 7101）。
- **UI 明示**：Agent 页面标注当前驱动为模拟环境，不伪装成真实平台自动化。

## 2. Level 1 半自动投递流程（默认等级）

```
POST /api/v1/agent/runs { jobId, resumeId?, useAI? }
  1. open_page        打开职位页（job.sourceUrl）
  2. extract_jd       读取职位信息（仅比对记录，不覆盖用户数据）
  3. policy_check     投递策略检查（mode 按 auto/manual）
  4. generate_content 生成打招呼语（默认纯模板拼接简历事实；useAI=true 时走 AI 网关）
  5. fill_form        填写申请表单
  6. wait_user_confirm 暂停，等待用户确认        ← 用户控制权锚点
POST /api/v1/agent/runs/:sessionId/confirm { approve | action: approve/reject/handover }
  7. submit           确认后提交 → createApplication(stage=applied)
```

- **Level 0 推荐**：`/recommendations`（规则评分批量计算 + 分桶），无 Agent 参与
- **Level 2 条件自动**：仅当策略**全部满足**（evaluatePolicy auto 模式 = ALLOW）才允许；当前版本只实现引擎判定，**自动执行器未启用**（见 docs/10），产品默认 Level 1

## 2.1 AI 打招呼语（V3 Phase 2 B1，借鉴 get_jobs）

- `useAI=true` 时 `generate_content` 走 AI 网关场景 `generate_greeting`：输入仅含简历事实（技能前 3 / 经历段数 / 个人优势）与职位信息，输出 ≤60 字（`GREETING_MAX_LENGTH`，BOSS 直聘输入框上限）
- **不编造约束**：prompt 硬性禁止引入简历/职位之外的公司、项目、数字、技能；超长或空回复视为不合规输出
- **优雅降级**：AI 失败（限额/网络/不合规）自动回退模板兜底，Agent 流永不因 AI 失败而中断；来源记入 agent_events（`greetingSource: template | ai | template_fallback`）

## 2.2 安全验证人工复检（V3 Phase 2 B2，借鉴 get_jobs「检测→暂停→人工→恢复」）

- 触发验证码：Agent 暂停（`captcha_blocked`），**绝不绕过**；同时联动创建站内提醒（见 2.4）
- 用户在自己的浏览器完成验证后，调 `POST /agent/runs/:sessionId/captcha/resolved` 复检：驱动重新检查页面——仍在验证页保持 blocked；已通过则从断点续填表与确认，不重复 open/policy
- 会话级恢复上限 `MAX_CAPTCHA_RESUMES = 2`：不自动重试，人工完成后允许有限次复检；平台反复风控时（复检通过后再次弹出）消耗同一配额，第三次弹出即无法再复检（终态 blocked），建议改走辅助导入；全部动作记入 agent_events（`captcha_manual_resolved`，source=user）
- 同步状态占位防并发：复检进行中重复调用 resolved API 会被状态校验拒绝（7102）

## 2.3 用户接管 Handover（V3 Phase 2 B3，借鉴 ai-job 人机切换权）

- 两个入口：确认阶段 `POST /agent/runs/:id/confirm {action:"handover"}`（兼容保留），或 `POST /agent/runs/:id/handover {reason?}`（同时覆盖「安全验证阻断」状态下直接接管的场景）
- 允许来源状态：等待确认 / 安全验证阻断；其余状态（running/submitted/rejected/handed_over）一律拒绝（7102）
- Agent 调 `driver.close()` 退出该页面，会话进入 `handed_over_to_user` 终态，不再执行任何操作；接管后 confirm/resolved 均被拒绝，不自动恢复
- 引导用户手动完成投递并用「手动投递」/投递看板记录结果；事件留痕：`user_handover`（source=user，detail.handoverReason）

## 2.4 阻断提醒联动（V3 Phase 2 B4，借鉴 ai-job 事件通知）

- blocked（登录墙/安全验证）时自动创建站内提醒（标题含职位与类型，content 含 sessionId/jobId），用户离开 Discovery 页也不会丢失待办
- 查重维度：userId + jobId + 提醒类型（需登录/安全验证）+ 未完成（pending），同一组合只建一条；人工复检通过后对应提醒自动标记 done
- 提醒联动失败不影响 Agent 主流程

## 3. 阻断语义（绝不重试、绝不绕过）

| 场景 | 驱动上报 | Agent 行为 |
|---|---|---|
| 平台要求登录 | page.kind = login_wall | blocked：「请在你自己的浏览器登录…不会尝试绕过登录」，停在第一步 |
| 弹出安全验证 | page.kind = captcha（clickApply 后） | **暂停**（`captcha_blocked`）：不填表不提交、绝不绕过；人工完成后可复检继续（≤2 次/会话，见 2.2）或直接接管（见 2.3） |
| 职页不可用 | not_found | failed：「职位可能已下线」 |
| 策略 REJECT | evaluateJobPolicy | blocked 于 policy_check，附原因 |
| 用户拒绝 | confirm(false) | rejected_by_user，无投递记录 |
| 用户接管 | handover（见 2.3） | handed_over_to_user 终态：Agent 退出页面，不再执行任何操作 |
| 步骤护栏 | — | 单次会话事件上限 12 步 |

被阻断的会话保留在内存（`getApplyFlowState` 可查；会话表挂 globalThis 单例，规避 Next dev 按路由打包导致模块副本、HMR 重置会话丢失的问题），所有动作已持久化到 `agent_events`；确认/复检带同步状态占位，并发重复请求被状态校验拒绝。

## 4. 审计闭环

每次运行产生 `agent_events` 序列（sessionId 串联）：`open_page → extract_jd → policy_check → generate_content → fill_form → wait_user_confirm(用户) → submit`，每条含 timestamp / action / source / jobId / result / error / userConfirmed / detail。

V3 Phase 2 新增可追踪事件：`captcha_blocked`（安全验证暂停，detail.stage）、`captcha_manual_resolved`（人工复检，detail.nextKind/captchaResumes）、`user_handover`（接管，detail.handoverReason，source=user）、`blocked_reminder_created`（提醒联动，detail.reminderId/kind）；`generate_content` 增强（detail.greetingSource 与降级原因 greetingError）。事件内容仅含流程状态与用户自身简历事实，不含任何凭证。

Dashboard Agent 漏斗由其聚合：发现岗位 → 符合条件（policy 通过）→ 推荐（匹配 ≥70）→ 用户确认 → 成功投递 → 面试 → Offer。

## 5. 真实浏览器驱动路线（未实现，明确边界）

- 形态：仅操作**用户本机已登录**的浏览器会话（用户自己的 Chrome/Edge），凭证永不进入 Job Hunter 后端
- 前置条件：合规评审 + 用户逐次授权 + 平台条款核对
- 降级链：自动提取失败 → 用户复制 URL/JD 走辅助导入（Stage A 已实现），系统任何情况下可用
