# 15 - 竞品分析：FRESUME（fresume.odsy.com.cn）

> 分析日期：2026-09-06（V1 静态逆向 + V2 注册账号 API 实证）
> 方法：① 主 JS bundle（1.3MB）+ CSS（533KB）静态逆向；② 注册研究账号 `jobhunter-research-7c2f9@example.com`，实测注册/主库/引导流程/STS 上传/配额门禁。未绕过任何配额（额度用尽即停）。
> 产物：`.research/fresume/`（bundle、CSS、上传脚本、响应样本留存）

## 1. 一句话结论

FRESUME = 面向 27 届秋招应届生的 AI 求职 SaaS。**架构核心是「主库（profile-source）单一事实源」**：一份个人主数据，向上投影出 引导简历 / 上传简历解析 / JD 适配变体 / 面试指南 / 网申包；**投递终点是 Chrome 插件填充 + 人工投递，无 Agent 自动投递**（= JobHunter 差异点）。

## 2. 技术栈（实证）

- **后端 FastAPI**（Pydantic 校验错误格式 + `{"detail"}` 404/422 响应）、JWT HS256（payload 内嵌 `plan:"free" / is_trial / is_demo`，24h 有效）。
- **前端** Vite + Vue 3 + Pinia 2.3.1 + vue-router 4.6.4 + Tailwind 4；pdfjs-dist、jszip+docx（前端本地导出 Word）。
- **存储** 阿里云 OSS STS 直传（`POST /uploads/sts` 按 `upload_dir + suffix` 发放 per-user key_prefix 凭证，服务器不经手文件流）。
- **AI** 全链路 SSE 流式；引导流程为**服务端状态机**（请求体为空，LLM 在服务端读会话生成）。
- index.html 内置微信 X5 / 老 WebView 兼容垫层（document_start 按需 polyfill，注释明言防简历画布挂掉）。

## 3. 实证数据模型（V2 新增）

### 3.1 主库 profile-source（全站中心）⭐
```json
{
  "basic": {"name","gender","birth","phone","email","location","hukou","politics","nationality","hometown"},
  "education": [{"school","degree","major","major_courses","start","end","gpa"}],
  "awards_text": "", "socials": [],
  "basic_en": null, "education_en": null, "awards_en": null, "socials_en": null,  // 双语投影
  "card_positions": {}, "resume_canvas_positions": {},   // 画布拖动位置持久化在主库
  "avatar_url": null, "is_complete": false,
  "incomplete_sections": ["basic","education","awards","socials"],
  "source": "manual", "backfilled_field_count": 0        // 网申截图识别回填计数
}
```
- 读 `GET` / 写 `PATCH /api/v1/profile-source`。
- 关键洞察：**简历/变体/网申包都是主库的投影**。网申包 = `{basic, education, experience, awards, self_evaluation, socials, extra_fields}`（前六项来自主库/适配简历抽取，extra_fields 是 JD 特有字段如期望薪资、可入职时间）。

### 3.2 引导式建简历：8 步服务端状态机 ⭐
`GET/POST /api/v1/resumes/guided/session` 持久化 `{current_node, state_json, active_resume_id, is_locked}`。节点：
`STEP1_PROFILE → STEP2_DIRECTION → STEP3_EXPERIENCE → STEP4_STAR → STEP5_SOFT → STEP6_PHOTO → STEP7_PREVIEW → STEP8_DONE`
各步 LLM 端点（**请求体为空**，服务端读 session 生成并回写）：`directions` / `self-eval` / `star` / `experiences/analyze` / `experiences/generate` / `generate`（带 `page_preference`）。
实测 `directions` 返回：
```json
{"portrait": "该生为计算机科学与技术专业本科生，…",
 "options": [{"name":"Java后端开发","why":"数据结构与操作系统课程为后端开发打下坚实基础…",
   "notes":"应届生可从中小厂或外包起步…需掌握 Spring Boot、MySQL、Redis 等。",
   "required_skills":"Java, Spring Boot, MySQL, Redis, Linux, Git"}, …]}
```
页数策略：应届生 1 页紧凑版式（内容超出→收紧排版→仍超→精简内容→极端降级 2 页）。

### 3.3 简历与解析
- `POST /api/v1/resumes` `{file_key, file_type, file_size, page_count, source, photo_key}` → 异步解析，记录字段含 `status(UPLOADED/…/FAILED/PARSED)`、`raw_text`、`parsed_json`、`converted_key/url`（PDF→Word 1 页紧凑重排）、`photo_key/url`、`deleted_at`、**`days_until_purge`**（软删除倒计时）。
- 解析产出 section 类型枚举（带 UI 色）：`personal 蓝 / education 青 / work 绿 / project 橙 / skills 紫 / summary 粉 / awards 黄 / other 灰`。
- 画布区域模型：`{label, type_label, page, x0, y0, x1, y1, paragraph_indices}` —— 归一化坐标 + 段落索引映射（可精确到段落的高亮与对话）。
- 软删除闭环：`GET /resumes/recycle-bin`、`POST /resumes/{id}/restore`、`DELETE /resumes/{id}/purge`；删除时明示「关联的匹配简历/面经/网申包一并清除且不可恢复，简历本体 7 天内可恢复」。

### 3.4 岗位匹配：单条 SSE 串起整条管线 ⭐
`POST /job-matchings` 建记录 → `POST /job-matchings/{id}/analyze/stream`，事件序列：
```
meta → delta{type:"paragraph", paragraph_index}（结构化段落增量，非 token 流）
     → supplement_ready → appack_method_choice（询问网申包生成方式：自动 / 截图识别）
     → appack_generating → appack_done | appack_failed → done | error
     （+ ocr_start / screenshots：JD/网申截图 OCR）
```
配套端点：`resume-variants/stream | modify/stream | supplement-apply/stream`、`resume-variants/{id}/apply`、`interview-guide/stream | regenerate`、`application-packs/auto-generate | from-screenshots | latest | regenerate | {id}/supplement`、`resume-versions/match-generated`、`resume-versions/{id}/preview|export`。
三层溯源对比：原版 / 知识库依据 / 新版 三栏（pcm 组件）。

### 3.5 其余实证模型
- **秋招信息源** `GET /api/v1/autumn-source`：`{company, url, screenshot_url, deadline, job_category, location, recruit_target:"27届提前批", source:"官网", published_at, is_today_new, days_left}`（days_left 服务端算）+ `/expired` 归档 + admin CRUD/黑名单/STS 截图上传。
- **岗位推荐** `POST /job-recommendations`、`GET /job-recommendations/me`（缓存式，404=未生成）；结果含 **`reasoning_path`（推理链路）** + `jobs` + `summary`。
- **面经** `interview-guides` 列表 `{items,total}` + 导出 docx；聊天带预设问题（如「公司业务准备：研究这个公司哪些业务/产品方向？给我 3 个切入点」「预测 5 道高频技术题并给答题思路大纲」）。
- **投递 CRM** `application-records` `{name(alias), company_name, position_title, status(已投递/笔试中/面试中/已结束), result(进行中/通过/未通过), path}` + notes + `analyze-audio`（语音笔记转写）。
- **知识墙** `knowledge/nodes`：`by_category` / `by_resume` 分组，节点含 `category:"advantage"` 等。
- **区域对话** `chats/by-region`、`chats/region-chats`、`by-region/{id}/archive`、`preset-questions`、`follow-ups`。

### 3.6 商业化（实证全表）
`GET /api/v1/subscription/plans?email=` 返回账号状态 + 全部档位：
| code | 档位 | 价格 | 配额 |
|---|---|---|---|
| trial | 1 元当天体验 | ¥1/1天，限购 1 次 | LLM 对话 20 次、每天上传 2 / 从 0 生成 2 / 岗位匹配 5 / 分析对话 25 |
| 9 | 体验周卡 | ¥9.9/7天 | 每天上传 1 / 从 0 生成 2 / 匹配 6 / 分析对话 25 |
| 19 | 标准月卡 | ¥19.9/30天 | 同周卡 |

- **支付 = 收款码图片 + 「付款后私信开通」人工审核**（admin subscription-orders）。极低成本冷启动打法。
- 配额门禁实证：额度耗尽时 STS 等接口返回 `{"code":"trial_quota_exceeded","message":"你的体验额度已到，获取更多额度点击下方按钮…"}` —— **错误码即营销位**（前端把 message 渲染成带按钮的弹窗）。
- 免费体验额度极小（本次研究账号仅成功上传 1 次、生成 1 次方向推荐即耗尽）。

## 4. 可借鉴清单（映射到 JobHunter）

| # | 借鉴点 | JobHunter 落点 | 改动量 |
|---|---|---|---|
| 1 | **主库单一事实源**：个人主数据 1 份，简历/变体/网申包皆投影；is_complete+incomplete_sections 驱动补全引导；backfilled_field_count 记录 OCR 回填 | `user_profiles` 已有雏形 → 升级为中心模型，resumes/tailor 产出引用主库字段 | 中 |
| 2 | **网申包数据结构** `{basic,education,experience,awards,self_evaluation,socials,extra_fields}` + auto/from-screenshots/supplement 三种生成方式 | 路线图 #4 Application Package 直接采用此结构；#5 Tracker 的投递记录字段也对齐 `{company_name,position_title,status,result}` | 中 |
| 3 | **三层溯源对比**（原版/依据/新版） | V3.1 B4 逐条采纳 UI 升级：每条建议补「依据」列（关联 B5 缺口分析证据） | 小 |
| 4 | **结构化 SSE 管线**：单流多阶段（meta→paragraph delta→分支选择→done），段落级增量渲染 | AI runner 现为一次性响应 → 引入 SSE + 阶段事件，长任务（匹配/批量生成）UX 质变 | 中 |
| 5 | **配额门禁 + 错误码营销**：5 类计数（对话/上传/生成/匹配/分析对话），`*_quota_exceeded` 带 CTA 文案 | 若商业化：policy-engine 同款思路加 per-feature 计数；错误消息设计直接抄 | 小 |
| 6 | **软删除回收站**：deleted_at + days_until_purge + restore/purge + 连带数据明示文案 | resumes/jobs 表加软删列；ConfirmDialog 文案写明级联影响 | 小 |
| 7 | **引导式 8 步建简历**（服务端状态机 + directions{portrait,options[required_skills]} 输出结构 + 页数收紧策略） | 路线图 #3 Resume Agent 增强；对应届生/学生模板（V3.1 student 模板已有）是天然配合 | 中 |
| 8 | OSS STS 直传（per-user key_prefix，服务器零带宽） | 若上云部署时采用；本地 SQLite 阶段不需要 | 小（届时） |
| 9 | 预设问题/追问/区域对话三件套；语音笔记转写 | MatchExplanation 对话化时的交互参考 | — |

**不抄**：人工私信开通支付（合规与规模风险）、多账号无验证注册（他们靠此冷启动但烧 LLM 成本）、秋招信息流（重运营人力，非我们路线）。

## 5. 验证状态

- ✅ 实测通过：注册、登录、profile-source 读写、guided/session + directions（真实 LLM 输出）、uploads/sts、resumes 创建（1 次成功解析入队、1 次格式失败）、配额门禁（trial_quota_exceeded）、autumn-source、plans。
- ❌ 未实证（额度所限）：parsed_json 具体结构、regions 段落映射实测、匹配/网申包/面经的完整生成内容（结构来自前端消费侧逆向，字段名可信，语义标注为推断）。
