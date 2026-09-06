"use client";

import { useCallback, useEffect, useState } from "react";
import { PlugZap, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AI_MODELS, AI_MODEL_GROUPS } from "@/shared/ai-models";

/** Stage A：求职条件（雷达过滤 / 投递策略硬过滤 / 匹配评分 三处共用的具体值） */
interface ProfileView {
  expectedPosition: string | null;
  expectedCity: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  experienceYears: number | null;
  education: string | null;
}

interface PolicyView {
  rules: {
    cities?: string[];
    positions?: string[];
    minSalary?: number;
    education?: string;
    maxExperienceYears?: number;
    [key: string]: unknown;
  } | null;
}

interface Conditions {
  cities: string;
  positions: string;
  salaryMin: number | "";
  salaryMax: number | "";
  experience: "" | "0" | "0.25" | "0.5" | "1" | "2" | "3" | "5";
  education: "" | "大专" | "本科" | "硕士" | "博士";
}

const EXPERIENCE_TIERS = [
  { value: "0", label: "无经验（应届/实习可）" },
  { value: "0.25", label: "3 个月" },
  { value: "0.5", label: "6 个月" },
  { value: "1", label: "1 年" },
  { value: "2", label: "2 年" },
  { value: "3", label: "3 年" },
  { value: "5", label: "5 年" },
] as const;

const SALARY_CHIPS = [3, 5, 8, 10, 15, 20];

function splitList(s: string): string[] {
  return s
    .split(/[、,，;；\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** Stage A-5：AI 设置页 —— 像 Hermes 一样：只粘 API Key + 选模型名，URL 由模型自动派生 */
interface AiSettingsView {
  configured: boolean;
  enabled: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string | null;
  updatedAt: string | null;
}

export default function SettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "save" | "test" | "clear">("");
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(AI_MODELS[0].id);
  const [enabled, setEnabled] = useState(true);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [cond, setCond] = useState<Conditions>({
    cities: "",
    positions: "",
    salaryMin: "",
    salaryMax: "",
    experience: "",
    education: "",
  });
  const [condSaving, setCondSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<AiSettingsView>("/settings/ai");
      setView(data);
      if (data.model) setModel(data.model);
      setEnabled(data.configured ? data.enabled : true);
    } catch (e) {
      toast(e instanceof Error ? e.message : "加载设置失败", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // 求职条件：合并读取 profile（喂匹配评分）+ 投递策略（硬过滤与雷达条件）
  useEffect(() => {
    void (async () => {
      try {
        const [prof, pol] = await Promise.all([
          api<ProfileView>("/users/me/profile"),
          api<PolicyView | null>("/policies/me").catch(() => null),
        ]);
        setCond({
          cities: pol?.rules?.cities?.join("、") || prof.expectedCity || "",
          positions: pol?.rules?.positions?.join("、") || prof.expectedPosition || "",
          salaryMin: pol?.rules?.minSalary ?? prof.salaryMin ?? "",
          salaryMax: prof.salaryMax ?? "",
          experience:
            pol?.rules?.maxExperienceYears != null
              ? (String(pol.rules.maxExperienceYears) as Conditions["experience"])
              : "",
          education: (pol?.rules?.education as Conditions["education"]) || "",
        });
      } catch {
        // 条件读取失败不阻塞设置页
      }
    })();
  }, []);

  async function saveConditions() {
    setCondSaving(true);
    try {
      const cityList = splitList(cond.cities);
      const posList = splitList(cond.positions);
      await api("/users/me/profile", {
        method: "PATCH",
        body: {
          expectedCity: cond.cities.trim() || null,
          expectedPosition: cond.positions.trim() || null,
          salaryMin: cond.salaryMin === "" ? null : Number(cond.salaryMin),
          salaryMax: cond.salaryMax === "" ? null : Number(cond.salaryMax),
          experienceYears: cond.experience === "" ? null : Number(cond.experience),
          education: cond.education || null,
        },
      });
      const pol = await api<PolicyView | null>("/policies/me").catch(() => null);
      // upsertPolicy 是整体替换 rules：先取存量合并，避免抹掉白名单/黑名单等字段
      await api("/policies/me", {
        method: "PUT",
        body: {
          ...(pol?.rules ?? {}),
          cities: cityList,
          positions: posList,
          minSalary: cond.salaryMin === "" ? undefined : Number(cond.salaryMin),
          education: cond.education || undefined,
          maxExperienceYears: cond.experience === "" ? undefined : Number(cond.experience),
        },
      });
      toast("求职条件已保存：用于雷达过滤、投递策略与匹配评分");
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存条件失败", "error");
    } finally {
      setCondSaving(false);
    }
  }

  async function save() {
    if (!model) {
      toast("请选择模型", "error");
      return;
    }
    if (!apiKey && !view?.configured) {
      toast("请粘贴 API Key", "error");
      return;
    }
    setBusy("save");
    try {
      const body: Record<string, unknown> = { model, enabled };
      if (apiKey) body.apiKey = apiKey;
      const data = await api<AiSettingsView>("/settings/ai", { method: "PUT", body });
      setView(data);
      setModel(data.model || model);
      setApiKey("");
      setTestResult(null);
      toast(data.enabled ? "已保存，AI 功能将使用你自备的模型" : "已保存；当前为停用状态，AI 功能使用系统默认");
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存失败", "error");
    } finally {
      setBusy("");
    }
  }

  async function test() {
    if (!apiKey && !view?.configured) {
      toast("请先粘贴 API Key", "error");
      return;
    }
    setBusy("test");
    setTestResult(null);
    try {
      const body: Record<string, unknown> = { model };
      if (apiKey) body.apiKey = apiKey;
      const data = await api<{ ok: boolean; model?: string; error?: string }>("/settings/ai/test", {
        method: "POST",
        body,
      });
      setTestResult(
        data.ok
          ? { ok: true, text: `连接成功，模型 ${data.model} 可用` }
          : { ok: false, text: data.error || "连接失败" },
      );
    } catch (e) {
      setTestResult({ ok: false, text: e instanceof Error ? e.message : "连接失败" });
    } finally {
      setBusy("");
    }
  }

  async function clearConfig() {
    setBusy("clear");
    try {
      await api("/settings/ai", { method: "DELETE" });
      await load();
      setApiKey("");
      setTestResult(null);
      toast("已清除配置，AI 功能回落系统默认");
    } catch (e) {
      toast(e instanceof Error ? e.message : "清除失败", "error");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <p className="text-sm text-t3">加载中…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-6">
      <PageHeader title="设置" desc="粘贴 API Key、选一个模型即可，所有 AI 能力自动切换到你自备的模型" />

      <Card className="p-5">
        <CardTitle>当前状态</CardTitle>
        {view?.configured ? (
          <div className="space-y-1.5 text-sm">
            <p className="text-t2">
              <span className={`mr-2 inline-block h-2 w-2 rounded-full ${view.enabled ? "bg-success" : "bg-warn"}`} />
              {view.enabled ? "已启用自备模型" : "已保存但停用中（回落系统默认）"}
            </p>
            <p className="text-t3">
              模型 <span className="font-semibold text-t1">{view.model}</span>
              {view.apiKeyMasked && (
                <>
                  {" "}· Key <span className="font-mono text-[12px] text-t2">{view.apiKeyMasked}</span>
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="text-sm text-t3">
            未配置。AI 功能使用系统默认模型；粘贴你自己的 API Key 后，简历解析、JD 结构化、匹配解读、
            打招呼语等全部 AI 能力都会改用你选的大模型。
          </p>
        )}
      </Card>

      <Card className="p-5">
        <CardTitle
          right={<span className="text-[11px] text-t3">雷达过滤 / 投递策略 / 匹配评分 三处共用</span>}
        >
          求职条件
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="期望城市" hint="多个用 、 分隔；留空不限">
            <Input
              value={cond.cities}
              onChange={(e) => setCond({ ...cond, cities: e.target.value })}
              placeholder="上海、苏州、深圳"
            />
          </Field>
          <Field label="期望岗位关键词" hint="匹配职位标题；留空不限">
            <Input
              value={cond.positions}
              onChange={(e) => setCond({ ...cond, positions: e.target.value })}
              placeholder="运营、电商、技术支持"
            />
          </Field>
          <Field label="期望薪资（K/月）" hint="低于下限的职位被硬过滤；点快捷档填下限">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={500}
                value={cond.salaryMin}
                onChange={(e) =>
                  setCond({ ...cond, salaryMin: e.target.value === "" ? "" : Number(e.target.value) })
                }
                placeholder="最低"
                className="max-w-[7rem]"
              />
              <span className="text-t3">–</span>
              <Input
                type="number"
                min={0}
                max={500}
                value={cond.salaryMax}
                onChange={(e) =>
                  setCond({ ...cond, salaryMax: e.target.value === "" ? "" : Number(e.target.value) })
                }
                placeholder="最高"
                className="max-w-[7rem]"
              />
              <div className="flex flex-wrap gap-1.5">
                {SALARY_CHIPS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCond({ ...cond, salaryMin: k })}
                    className="rounded-full border border-border-strong px-2.5 py-1 text-[11px] text-t2 transition hover:border-primary hover:text-primary"
                  >
                    {k}k
                  </button>
                ))}
              </div>
            </div>
          </Field>
          <div className="grid gap-4">
            <Field label="经验档位" hint="可接受职位的最高经验要求">
              <Select
                value={cond.experience}
                onChange={(e) => setCond({ ...cond, experience: e.target.value as Conditions["experience"] })}
              >
                <option value="">不限</option>
                {EXPERIENCE_TIERS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="最高学历" hint="职位要求不得高于此学历">
              <Select
                value={cond.education}
                onChange={(e) => setCond({ ...cond, education: e.target.value as Conditions["education"] })}
              >
                <option value="">不限</option>
                <option value="大专">大专</option>
                <option value="本科">本科</option>
                <option value="硕士">硕士</option>
                <option value="博士">博士</option>
              </Select>
            </Field>
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={saveConditions} disabled={condSaving}>
            {condSaving ? "保存中…" : "保存求职条件"}
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <CardTitle right={<span className="text-[11px] text-t3">支持主流国产模型</span>}>
          自备模型
        </CardTitle>

        <div className="space-y-4">
          <Field
            label="① 粘贴 API Key"
            hint={view?.configured ? `已保存 ${view.apiKeyMasked}，留空保持不变` : "在服务商控制台创建，保存后只显示掩码"}
          >
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={view?.configured ? "••••••••（留空保持不变）" : "sk-..."}
              autoComplete="off"
            />
          </Field>

          <Field label="② 选择模型" hint="接口地址自动匹配，无需填写">
            <Select value={model} onChange={(e) => setModel(e.target.value)}>
              {AI_MODEL_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {AI_MODELS.filter((m) => m.group === g).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>

          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-t2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            启用自备模型（关闭后所有 AI 功能回落系统默认）
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Button onClick={save} disabled={busy !== ""}>
            <Save size={15} /> {busy === "save" ? "保存中…" : "保存"}
          </Button>
          <Button variant="soft" onClick={test} disabled={busy !== ""}>
            <PlugZap size={15} /> {busy === "test" ? "测试中…" : "测试连接"}
          </Button>
          {view?.configured && (
            <Button variant="danger" onClick={clearConfig} disabled={busy !== ""}>
              <Trash2 size={15} /> {busy === "clear" ? "清除中…" : "清除配置"}
            </Button>
          )}
        </div>

        {testResult && (
          <p className={`mt-3 text-[13px] ${testResult.ok ? "text-success" : "text-danger"}`}>
            {testResult.ok ? "✓ " : "✕ "}
            {testResult.text}
          </p>
        )}

        <p className="mt-4 border-t border-border pt-3 text-[11.5px] leading-relaxed text-t3">
          安全说明：API Key 使用 AES-256-GCM 加密后存库，任何页面与接口都不会返回完整
          Key；保存前可用「测试连接」验证（错误信息自动脱敏）。每日调用限额仍然生效。
        </p>
      </Card>
    </div>
  );
}
