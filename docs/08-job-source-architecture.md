# 08 Job Source 架构（V2）

## 1. V2 现状分析与复用结论（实施前检查记录）

- **Current Architecture**：Next.js 15 单应用四层（api 薄控制器 → core 领域服务 → ai/db 基础设施 → shared 同构层），20 表、55 测试（V2 前基线）。
- **Existing Reusable**：jobs 表已有 source/sourceUrl/structured；createJob（公司建档）；mock Provider 的确定性 JD 扫描器；match-scorer 纯函数；application 状态机；ai_tasks/限额；测试基建。
- **Potential Conflicts** 与处理：jobs.source 旧值（manual/paste）保留为纯字符串扩展；唯一索引含 NULL 列在 SQLite 下安全；去重用内容指纹而非 pgvector。

## 2. 统一接口

```
JobSource（src/server/job-sources/core/types.ts）
├── meta()          → 名称/状态(available|connected|degraded|unavailable)/能力模型
├── capabilities()  → { search, assistedImport, autoApply: none|assisted|conditional, requiresLogin }
├── healthCheck()   → { ok, detail }（失败自动降级，不影响其他来源）
├── search?()       → 自动搜索（多数平台无合法公开 API，缺省即不支持）
├── getJobDetail?() → 按 sourceJobId 取详情
└── importAssisted?() → 用户辅助导入（URL + 粘贴 JD）
```

**设计原则**：不支持的能力在接口上缺省（`boss.search === undefined`），而不是抛错；任何来源失败只标记该来源 degraded/unavailable，主系统不受影响（失败隔离）。

## 3. 数据流

```
RawJobInput(url/text/sourceJobId/rawData)
  ↓ JobSource.importAssisted（平台特有提取：如 BOSS URL → sourceJobId）
UnifiedJob（纯标准化输入模型，不持久化）
  ↓ Deduplicator（三级）
  ↓ createJob()（复用现有服务：公司建档 + structured 落库 + 自动解析任务缺省跳过）
jobs 表（+ V2 增量列：source_job_id/district/employment_type/job_type/tags/posted_at/raw_data/fingerprint）
  ↓ agent_events（action=import 审计）
```

UnifiedJob **不是**第二套业务模型：它只存在于导入管道中，落库唯一入口是 createJob。

## 4. 指纹与去重

指纹 = SHA-256( 规范化公司 | 规范化职位 | 归一城市 | 规范化JD )，前 40 位。

规范化（先于哈希，全部确定性）：去 HTML 标签 / URL / 日期 → 薪资格式统一（15-25K ≡ 15K~25K ≡ 1-2万→10-20k）→ 小写 → 压掉全部空白 → 仅保留字母数字汉字与连字符；公司名去法律后缀（有限公司/股份/集团）；城市归一到规范名。

三级判定（用户范围内）：

| 级别 | 条件 | 行为 |
|---|---|---|
| EXACT_DUPLICATE | source+sourceJobId 命中，或指纹一致 | 返回既有职位，不重建（幂等） |
| POSSIBLE_DUPLICATE | 公司+职位+城市归一后一致但内容不同 | 仍创建，rawData.possibleDuplicateOf 标记 + warnings 提示，人工确认 |
| NEW | 无匹配 | 正常创建 |

跨平台**改写措辞**的 JD 指纹必然不同——按「不高置信不合并」原则落入 POSSIBLE，而非强行合并。

## 5. 平台支持矩阵（V3 Phase 1 更新）

| 来源 | search | assistedImport | autoApply | 说明 |
|---|---|---|---|---|
| BOSS直聘 boss | ❌ | ✅ | none | 无公开 API（已核实，不虚构）；仅辅助导入；需用户自己登录 |
| 猎聘 liepin | ❌ | ✅ | none | V3 新增；仅辅助导入；URL 提取规则 NEEDS_VERIFICATION |
| 智联招聘 zhilian | ❌ | ✅ | none | V3 新增；同上 |
| 拉勾招聘 lagou | ❌ | ✅ | none | V3 新增；同上 |
| 前程无忧 job51 | ❌ | ✅ | none | V3 新增；同上 |
| 模拟源 mock | ✅ | ✅ | assisted | 内置测试/演示数据，CI 用 |
| 公司官网 company-career | — | 预留 | — | Phase 7 Company Intelligence 一并落地 |

四个国内站点适配器由 `adapters/china-site.ts` 工厂统一生成（与 BossAdapter 同策略），URL → sourceJobId 提取规则**全部标记 NEEDS_VERIFICATION**：提取失败不阻塞导入（sourceJobId 置空，去重回退内容指纹）。站点元数据（官网/操作指引/验证状态）维护在 `core/site-catalog.ts`，经 `GET /api/v1/job-sources` 的 `sites` 字段暴露。

## 6. 新增来源指南

1. 实现 `JobSource`（至少 `importAssisted`）；绝不实现绕过安全机制的能力
2. 在 `builtin.ts` 注册
3. 单测：能力声明、归一化、错误路径（缺 JD → IMPORT_INVALID 且提示补充）
4. 集成：经 import-service 走完 去重→落库→审计 全链路
