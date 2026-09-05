# 10 Application Policy（V2）

## 1. 模型

每用户一份策略（`application_policies`，rules JSON），由 `evaluatePolicy(rules, ctx)` 纯函数判定——可解释（每条判定附原因）、可测试（17 个单测）、可调参。

## 2. 规则集

| 规则 | 类型 | 不满足时（手动投递） | 不满足时（Agent 自动） |
|---|---|---|---|
| companyWhitelist | 白名单 | **直接 ALLOW**（优先于一切） | 直接 ALLOW |
| companyBlacklist | 硬性 | REJECT | REJECT |
| cities 目标城市 | 硬性 | REJECT | REJECT |
| positions 目标岗位关键词 | 硬性 | REJECT | REJECT |
| minSalary 最低薪资 | 硬性（职位未标薪资→信息不足） | 信息不足→需确认 | 信息不足→REJECT |
| education 学历（职位要求不得高于） | 硬性 | REJECT | REJECT |
| maxExperienceYears 经验上限 | 硬性 | REJECT | REJECT |
| acceptInternship / acceptCampus | 硬性 | REJECT | REJECT |
| minMatchScore 最低匹配分 | 软性 | REQUIRE_USER_CONFIRMATION | REJECT |
| dailyMaxApplications 每日上限 | 软性 | REQUIRE_USER_CONFIRMATION | REJECT |

判定顺序：白名单 → 硬性（任一 REJECT 即拒）→ 软性（任一 → 需确认）→ ALLOW。硬性拒绝优先于软性确认。

## 3. 执行点

1. **手动投递**（Level 0→1）：`createApplication(stage=applied)` 与 `transitionStage(→applied)` 强制执行，`mode=manual`；REJECT → 403/6030 附原因（用户可调整策略后重试）
2. **Agent 流程**（Level 1）：`policy_check` 步骤执行；REJECT → blocked，不填表不提交
3. **Level 2 条件自动**：`mode=auto` 下必须 ALLOW 才允许执行（执行器当前未启用）

## 4. 示例

```jsonc
{
  "cities": ["深圳"],
  "positions": ["Java", "后端"],
  "minSalary": 7,               // 7K/月
  "education": "本科",
  "maxExperienceYears": 5,
  "companyBlacklist": ["某骗子公司"],
  "companyWhitelist": ["字节"],
  "minMatchScore": 85,
  "acceptInternship": false,
  "acceptCampus": false,
  "dailyMaxApplications": 10
}
```

## 5. API

- `GET /api/v1/policies/me` → 策略或 null（未配置 = 全部放行）
- `PUT /api/v1/policies/me` → 保存（zod 校验，非法 400/1001）
- 每次策略执行写 `agent_events(action=policy_check)`，Dashboard「符合条件」即其成功数
