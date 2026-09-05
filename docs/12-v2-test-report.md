# 12 V2 测试报告

> 统计口径：`npx vitest run`（2026-08-30，V2 全阶段完成后）

## 1. 总体结果

| 检查项 | 结果 |
|---|---|
| Vitest 全量 | **130 / 130 通过**（21 个测试文件） |
| 其中既有 MVP 用例 | 55 / 55（语义未变） |
| V2 新增用例 | 75 |
| tsc --noEmit | 干净 |
| next build | 成功（含 3 个新页面） |
| 浏览器冒烟 | 通过（见 §4） |

## 2. 分阶段结果

| 阶段 | 交付 | 测试 |
|---|---|---|
| A 来源适配架构 | JobSource 接口/Registry/Normalizer/Deduplicator/Boss+Mock 适配器/import-service/API/Job Sources 页 | normalizer 14 + dedup 6 + registry 4 + adapters 7 + import 6 + api 4 |
| B 策略与推荐 | policy-engine（纯函数）/policy-service/投递门禁(6030)/推荐分桶/API | 引擎 17 + api 9 |
| C AI 解读升级 | MatchExplanation(优势/差距/风险)+Prompt+mock+runner 持久化 | matches 5（含断言升级） |
| D BrowserAgent | BrowserDriver 抽象/MockDriver/ApplyFlow Level 1/审计/路由 | apply-flow 8 |
| E 前端 | Job Discovery / Agent 运行面板 / Dashboard Agent 漏斗 | tsc+build 覆盖，冒烟手测 |

关键测试场景覆盖：

- 指纹三性质（用户指定）：同职位跨平台相同 / 空白与 HTML 差异相同 / 不同职位不同 ✅
- 三级去重：source+sourceJobId、跨平台指纹、POSSIBLE 不合并、用户隔离 ✅
- 策略：17 条决策路径（白名单直通/黑名单/城市/岗位/薪资含"未标薪资不猜"/学历/经验/实习/校招/匹配分×手动自动/每日上限×手动自动/多原因聚合/硬性优先）✅
- 投递门禁：wishlist→applied 403/6030 附原因；直接 applied 创建同样拦截；policy_check 审计落库 ✅
- ApplyFlow：全链路 8 步事件序列、用户拒绝、登录墙、验证码、策略拒绝、会话错误状态、职位/简历缺失 ✅

## 3. 过程中发现并修复的问题

| # | 问题 | 修复 |
|---|---|---|
| 1 | createJob 未接受新字段导致去重测试失真 | 可选字段向后兼容扩展 |
| 2 | 薪资归一漏「15K~25K」且「万」须先于 K 归一 | 正则重排 + 可选单位 |
| 3 | ruleParseJd 未剥 HTML，首行标题变成标签 | 解析前剥标签 |
| 4 | 适配器 importAssisted 同步 throw 使 rejects 失效 | 改 async 契约 |
| 5 | 资源 NOT_FOUND 未映射 404 | httpStatusFor 补全 |
| 6 | createApplication 策略门禁引用未初始化变量（顺序错误） | 移至 stage 声明后 |
| 7 | 测试笔误三处（params 传 app.id、错误路径导入 PATCH/refreshRoute、测试数据未覆盖分桶阈值） | 修正并按评分器语义重设夹具 |
| 8 | 残留 next 进程占用 3000 端口（新构建未生效 404） | 清理进程重启 |
| 9 | 测试环境受控标签页真实指针事件不可达 | 程序化点击走完整 React 链路完成冒烟（登录/导入链路均已验证） |

## 4. 浏览器冒烟（真实浏览器）

- 登录 → Job Sources：BOSS 能力徽章（不可搜索/辅助导入/不支持自动投递/需用户自行登录）与健康检查正确渲染 ✅
- BOSS 辅助导入：source=boss、sourceJobId=smoke777（URL 提取）、sourceUrl、fingerprint=1c109598…、structured 技能解析 ✅
- 重复导入 →「精确重复（未重建）」+ 警告，DB 仅 1 条；agent_events 记录 NEW→EXACT_DUPLICATE ✅

## 5. 已知限制

1. 真实浏览器驱动未实现（AGENT_DRIVER 仅 mock）；Level 2 自动执行器未启用（引擎已就绪）
2. 跨平台改写措辞的 JD 只给 POSSIBLE_DUPLICATE 提示，不做自动合并
3. 真实平台 search 未实现（无公开 API）；平台接入须过合规评审
4. 推荐阈值 85/70 为初始值，需真实数据校准
5. Mock 驱动的浏览器测试覆盖状态机语义；真实网页渲染差异需人工 Smoke（不进 CI）
