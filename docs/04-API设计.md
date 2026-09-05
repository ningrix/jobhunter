# 04 API 设计

## 通用约定

- 基础路径：`/api/v1`
- 认证：httpOnly Cookie（`jh_access` JWT 15min / `jh_refresh` 30d 轮换）；同时接受 `Authorization: Bearer <accessToken>`（便于测试与未来开放 API）
- 统一响应信封：

```json
{ "code": 0, "message": "ok", "data": { } }
```

- 错误码分段：`1xxx` 通用 / `2xxx` 用户 / `3xxx` 简历 / `4xxx` 职位 / `5xxx` 匹配 / `6xxx` 投递 / `9xxx` AI；HTTP 状态码按语义映射（401/403/404/409/429/500）
- 异步 AI 任务统一模式：`POST .../xxx` 返回 `202 { taskId }` → 客户端轮询 `GET /ai-tasks/:id` 至 succeeded/failed

## 错误码表（常用）

| code | 含义 | HTTP |
|---|---|---|
| 1001 | 参数校验失败（details 含字段错误） | 400 |
| 1002 | 未登录/登录过期 | 401 |
| 1004 | 资源不存在 | 404 |
| 2001 / 2002 / 2003 | 邮箱已注册 / 凭证错误 / 账号禁用 | 400 / 401 / 403 |
| 3001 / 3002 / 3003 | 简历/版本不存在 / 文件解析失败 | 404 / 404 / 400 |
| 4001 / 4002 | 职位不存在 / JD 解析失败 | 404 / 400 |
| 5001 / 5002 | 匹配记录不存在 / 重复 | 404 / 409 |
| 6001 / 6002 / 6003 | 投递不存在 / 非法阶段流转 / 重复投递 | 404 / 400 / 409 |
| 9001 / 9002 / 9003 / 9004 | 任务不存在 / 任务失败 / 超 AI 日限额 / Provider 错误 | 404 / 400 / 429 / 400 |

## 端点清单

### 认证 `auth`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /auth/register | 注册（种下双 cookie），201 |
| POST | /auth/login | 登录 |
| POST | /auth/refresh | 刷新令牌轮换（读 refresh cookie） |
| POST | /auth/logout | 吊销刷新令牌 + 清 cookie |
| GET | /auth/me | 当前用户 + 画像 🔒 |

### 用户 `users`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET / PATCH | /users/me/profile | 画像读取 / 局部更新 🔒 |

### 简历 `resumes`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET / POST | /resumes | 列表 / 新建（content 可选）🔒 |
| GET / PATCH / DELETE | /resumes/:id | 详情(含全部版本) / 改标题或设主简历 / 软删 🔒 |
| POST | /resumes/:id/versions | 保存新版本（content, note, source=manual\|ai）🔒 |
| POST | /resumes/upload | multipart 上传 → 提取文本 → 建档 → 202 {resumeId, taskId} 🔒 |
| POST | /resumes/:id/optimize | AI 优化任务（versionId 可选默认最新）→ 202 {taskId} 🔒 |
| GET | /resumes/:id/analysis?versionId= | 最新诊断（score/issues/suggestions）🔒 |

### 职位 `jobs`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /jobs?keyword=&favorite=1&status=active\|archived\|all | 列表筛选 🔒 |
| POST | /jobs | 创建（structured 可选，缺省自动发起解析 → 201 {job, taskId}）🔒 |
| GET / PATCH / DELETE | /jobs/:id | 详情(含 favorited) / 更新或归档 / 软删 🔒 |
| POST | /jobs/parse | 粘贴 JD 解析 → 202 {taskId}，任务 output.structured 即结构化结果 🔒 |
| POST | /jobs/:id/favorite | 收藏切换 → {favorited} 🔒 |

### 匹配 `matches`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /matches?jobId= | 列表（按 total_score 倒序，含 jobTitle/companyName）🔒 |
| POST | /matches | 计算 {jobId, resumeId, useAI} → 201 {match, taskId?}；重复即更新 🔒 |
| GET | /matches/:id | 详情 🔒 |

### 投递 `applications`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /applications?stage= | 列表（含 job 信息）🔒 |
| POST | /applications | 创建（唯一约束防重复，6003）🔒 |
| GET / PATCH / DELETE | /applications/:id | 详情(含 events) / 改备注、nextActionAt、resumeId / 删除 🔒 |
| POST | /applications/:id/stage | 阶段流转 {toStage, note?}，白名单校验（6002）🔒 |
| POST | /applications/:id/events | 追加跟进备注 🔒 |
| GET | /applications/board | 看板聚合：6 列 × 卡片（job+resumeTitle）🔒 |

### 提醒 `reminders`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /reminders?status=pending\|done\|ignored\|all&due=1 | due=1 仅返回已到期 🔒 |
| POST | /reminders | 创建（可关联 applicationId）🔒 |
| PATCH | /reminders/:id | {status: done\|ignored} 🔒 |

### AI 任务与看板
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /ai-tasks/:id | 任务状态/输出（归属校验）🔒 |
| GET | /dashboard/overview | 统计卡、阶段分布、漏斗、8 周趋势、提醒计数 🔒 |

## 时序：AI 优化建议（前端视角）

```
POST /resumes/:id/optimize → 202 {taskId}
loop GET /ai-tasks/:id (≈0.7s 间隔)
  queued/running → 继续
  succeeded → GET /resumes/:id/analysis → 渲染评分/问题/建议
  failed → 展示 task.error
```
