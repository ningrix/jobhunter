"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Ban, CircleCheck, CircleX, Compass, RefreshCw, Sparkles } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Loading } from "@/components/ui/spinner";
import { PageHeader } from "@/components/ui/page-header";

interface RecommendationItem {
  id: string;
  jobId: string;
  resumeId: string;
  totalScore: number;
  gaps: { dimension: string; detail: string }[];
  summary: string | null;
  jobTitle: string;
  companyName: string;
  city: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  source: string;
  sourceUrl: string | null;
  applicationId: string | null;
  stage: string | null;
}

interface AgentEvent {
  id: string;
  action: string;
  result: string;
  detail: Record<string, unknown> | null;
  error: string | null;
}

const BUCKETS = [
  { key: "all", label: "全部" },
  { key: "strong", label: "强烈推荐" },
  { key: "recommended", label: "推荐" },
  { key: "confirm", label: "待确认" },
  { key: "applied", label: "已投递" },
] as const;

// —— 匹配权重向量（用户可调，0-10，后端归一化后加权点积） ——
const DIMS = [
  { key: "skills", label: "技能匹配" },
  { key: "experience", label: "经验" },
  { key: "education", label: "学历" },
  { key: "city", label: "城市" },
  { key: "salary", label: "薪资" },
] as const;
type WKey = (typeof DIMS)[number]["key"];
type WVector = Record<WKey, number>;
const DEFAULT_W: WVector = { skills: 4, experience: 2.5, education: 1.5, city: 1, salary: 1 };
const WEIGHT_PRESETS: { label: string; weights: WVector }[] = [
  { label: "技能优先", weights: { skills: 8, experience: 2, education: 1, city: 0.5, salary: 0.5 } },
  { label: "城市优先", weights: { city: 8, skills: 2, experience: 0.5, education: 0.5, salary: 1 } },
  { label: "薪资优先", weights: { salary: 8, skills: 2, experience: 0.5, education: 0.5, city: 1 } },
];

const ACTION_LABEL: Record<string, string> = {
  open_page: "打开职位页",
  extract_jd: "读取 JD",
  policy_check: "投递策略检查",
  generate_content: "生成投递内容",
  fill_form: "填写申请表单",
  wait_user_confirm: "等待用户确认",
  captcha_blocked: "安全验证阻断",
  captcha_manual_resolved: "验证码人工复检",
  user_handover: "用户接管",
  blocked_reminder_created: "阻断提醒已创建",
  submit: "提交投递",
  blocked: "已阻断",
  import: "来源导入",
};

function scoreBadgeCls(score: number): string {
  if (score >= 85) return "border-success-border bg-success-soft text-success";
  if (score >= 70) return "border-primary-soft-border bg-primary-soft text-primary";
  return "border-warn-border bg-warn-soft text-warn";
}

export default function DiscoveryPage() {
  const [bucket, setBucket] = useState<string>("all");
  const [rows, setRows] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  // Agent 运行面板
  const [runSession, setRunSession] = useState<string | null>(null);
  const [runJob, setRunJob] = useState<string | null>(null);
  const [runEvents, setRunEvents] = useState<AgentEvent[]>([]);
  const [runStatus, setRunStatus] = useState<string>("");
  const [runBlocked, setRunBlocked] = useState<string>("");
  const [useAI, setUseAI] = useState(false);
  // 匹配偏好面板
  const [wOpen, setWOpen] = useState(false);
  const [weights, setWeights] = useState<WVector>(DEFAULT_W);
  const [customized, setCustomized] = useState(false);

  useEffect(() => {
    api<{ matchWeights: Partial<WVector> | null }>("/users/me/profile")
      .then((p) => {
        if (p.matchWeights) {
          setWeights({ ...DEFAULT_W, ...p.matchWeights });
          setCustomized(true);
        }
      })
      .catch(() => undefined);
  }, []);

  async function load(b = bucket) {
    setLoading(true);
    try {
      setRows(await api<RecommendationItem[]>(`/recommendations?bucket=${b}`));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load(bucket);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket]);

  async function refresh() {
    setBusy("refresh");
    setMsg("");
    try {
      const { updated } = await api<{ updated: number }>("/recommendations/refresh", {
        method: "POST",
        body: {},
      });
      setMsg(`已重新匹配 ${updated} 个活跃职位`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "刷新失败");
    } finally {
      setBusy("");
    }
  }

  async function applyWeights(next: WVector | null) {
    setBusy("weights");
    setMsg("");
    try {
      await api("/users/me/profile", { method: "PATCH", body: { matchWeights: next } });
      if (next) setCustomized(true);
      else {
        setCustomized(false);
        setWeights(DEFAULT_W);
      }
      const { updated } = await api<{ updated: number }>("/recommendations/refresh", {
        method: "POST",
        body: {},
      });
      setMsg(next ? `权重已生效，已重算 ${updated} 个职位` : "已恢复系统默认权重");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "应用权重失败");
    } finally {
      setBusy("");
    }
  }

  const wSum = DIMS.reduce((s, d) => s + weights[d.key], 0);

  async function loadRunEvents(sessionId: string) {
    const events = await api<AgentEvent[]>(`/agent/events?sessionId=${sessionId}`);
    setRunEvents(events);
    const last = events[events.length - 1];
    if (last?.action === "wait_user_confirm" && last.result === "waiting_user") {
      setRunStatus("awaiting_confirmation");
    } else if (last?.action === "user_handover") {
      setRunStatus("handed_over_to_user");
      setRunBlocked(last.error ?? "");
    } else if (last?.action === "submit") {
      setRunStatus(last.result === "success" ? "submitted" : "failed");
      setRunBlocked(last.error ?? "");
    } else if (last?.result === "blocked") {
      setRunStatus("blocked");
      setRunBlocked(last.error ?? "");
    }
  }

  async function startAgent(item: RecommendationItem) {
    setBusy(item.jobId);
    setMsg("");
    setRunBlocked("");
    try {
      const r = await api<{ status: string; sessionId: string; blockedReason?: string }>("/agent/runs", {
        method: "POST",
        body: { jobId: item.jobId, resumeId: item.resumeId, useAI },
      });
      setRunSession(r.sessionId);
      setRunJob(item.jobTitle);
      setRunStatus(r.status);
      setRunBlocked(r.blockedReason ?? "");
      await loadRunEvents(r.sessionId);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Agent 启动失败");
    } finally {
      setBusy("");
    }
  }

  async function confirmRun(approve: boolean, action?: "approve" | "reject" | "handover") {
    if (!runSession) return;
    setBusy("confirm");
    try {
      const r = await api<{ status: string; blockedReason?: string }>(
        `/agent/runs/${runSession}/confirm`,
        { method: "POST", body: action ? { action } : { approve } },
      );
      setRunStatus(r.status);
      setRunBlocked(r.blockedReason ?? "");
      await loadRunEvents(runSession);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy("");
    }
  }

  async function handoverNow() {
    if (!runSession) return;
    setBusy("handover");
    try {
      const r = await api<{ status: string; blockedReason?: string }>(
        `/agent/runs/${runSession}/handover`,
        { method: "POST", body: { reason: "用户选择自行完成投递" } },
      );
      setRunStatus(r.status);
      setRunBlocked(r.blockedReason ?? "");
      await loadRunEvents(runSession);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy("");
    }
  }

  async function captchaResolved() {
    if (!runSession) return;
    setBusy("captcha");
    try {
      const r = await api<{ status: string; blockedReason?: string }>(
        `/agent/runs/${runSession}/captcha/resolved`,
        { method: "POST", body: {} },
      );
      setRunStatus(r.status);
      setRunBlocked(r.blockedReason ?? "");
      await loadRunEvents(runSession);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "复检失败");
    } finally {
      setBusy("");
    }
  }

  async function manualApply(item: RecommendationItem) {
    setBusy(item.jobId);
    setMsg("");
    try {
      const app = await api<{ id: string }>("/applications", {
        method: "POST",
        body: { jobId: item.jobId, resumeId: item.resumeId },
      });
      await api(`/applications/${app.id}/stage`, { method: "POST", body: { toStage: "applied" } });
      setMsg(`已手动投递：${item.jobTitle}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "投递失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="职位发现"
        desc="匹配引擎持续为你筛选活跃职位，Agent 半自动完成投递（提交前必经你的确认）"
        right={
          <Button onClick={refresh} disabled={busy !== ""}>
            <RefreshCw size={14} strokeWidth={1.8} />
            {busy === "refresh" ? "匹配计算中…" : "重新匹配全部职位"}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {BUCKETS.map((b) => (
            <button
              key={b.key}
              onClick={() => setBucket(b.key)}
              className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
                bucket === b.key
                  ? "bg-gradient-brand text-on-primary"
                  : "border border-border-strong bg-surface text-t2 hover:text-t1"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-t2">
          <input
            type="checkbox"
            checked={useAI}
            onChange={(e) => setUseAI(e.target.checked)}
            className="h-4 w-4 accent-[#6366f1]"
          />
          AI 打招呼语（失败自动回退模板，≤60 字）
        </label>
        {msg && <span className="text-sm text-t2">{msg}</span>}
      </div>

      <Card className="p-5">
        <CardTitle
          right={
            <button
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setWOpen(!wOpen)}
            >
              {wOpen ? "收起" : "展开调节"}
            </button>
          }
        >
          匹配偏好 · 权重向量
        </CardTitle>
        <p className="-mt-1.5 text-xs leading-relaxed text-t3">
          {customized
            ? "正在使用你的自定义权重，改完点「应用」即可实时重排推荐。"
            : "当前使用系统默认权重（技能40 / 经验25 / 学历15 / 城市10 / 薪资10）。调节五维权重，综合分 = 归一化权重 × 维度分的加权点积。"}
        </p>
        {wOpen && (
          <>
            <div className="mb-4 mt-3 flex flex-wrap gap-2">
              {WEIGHT_PRESETS.map((p) => (
                <Button key={p.label} variant="ghost" size="sm" onClick={() => setWeights(p.weights)}>
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {DIMS.map((d) => (
                <label key={d.key} className="block">
                  <span className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-t2">{d.label}</span>
                    <span className="font-mono text-t3">
                      原始 {weights[d.key].toFixed(1)} · 归一化{" "}
                      {wSum > 0 ? Math.round((weights[d.key] / wSum) * 100) : 0}%
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={weights[d.key]}
                    onChange={(e) => setWeights({ ...weights, [d.key]: Number(e.target.value) })}
                    className="w-full accent-[#6366f1]"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button size="sm" onClick={() => applyWeights(weights)} disabled={busy !== ""}>
                {busy === "weights" ? "应用中…" : "应用权重并重算"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => applyWeights(null)} disabled={busy !== ""}>
                恢复系统默认
              </Button>
            </div>
          </>
        )}
      </Card>

      <div className="space-y-3">
        {loading && <Loading />}
        {!loading && rows.length === 0 && (
          <Card>
            <EmptyState
              icon={Compass}
              title="暂无推荐"
              hint="先到职位来源导入职位，再点「重新匹配全部职位」"
              action={
                <Link
                  href="/job-sources"
                  className="inline-flex h-9 items-center rounded-[10px] border border-primary-soft-border bg-primary-soft px-4 text-sm font-semibold text-primary transition hover:bg-primary-soft/70"
                >
                  去职位来源导入
                </Link>
              }
            />
          </Card>
        )}
        {rows.map((r) => (
          <Card key={r.id} className="p-5 transition-colors hover:border-primary-soft-border">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-t1">
                  {r.jobTitle}
                  <span className="ml-2 text-[12.5px] font-normal text-t3">{r.companyName}</span>
                </p>
                <p className="mt-0.5 text-[12.5px] font-medium text-success">
                  {r.city ?? "—"}
                  {r.salaryMax ? ` · ${r.salaryMin ?? "?"}-${r.salaryMax}K` : ""}
                  {r.stage && <span className="ml-2 text-xs font-normal text-t3">（{r.stage}）</span>}
                </p>
                {r.sourceUrl && (
                  <p className="mt-0.5 text-xs text-t3">
                    来源：
                    <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:text-primary-hover">
                      {r.source} ↗
                    </a>
                  </p>
                )}
                {r.gaps.length > 0 && (
                  <p className="mt-1 text-xs text-warn">差距：{r.gaps.slice(0, 2).map((g) => g.detail).join("；")}</p>
                )}
                {r.summary && <p className="mt-1 text-xs leading-relaxed text-t3">{r.summary}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full border text-sm font-bold ${scoreBadgeCls(r.totalScore)}`}
                >
                  {Math.round(r.totalScore)}
                </span>
                {r.applicationId == null && (
                  <Button onClick={() => startAgent(r)} disabled={busy !== ""} size="sm">
                    <Sparkles size={13} strokeWidth={1.8} />
                    {busy === r.jobId ? "Agent 运行中…" : "Agent 半自动投递"}
                  </Button>
                )}
                {r.applicationId == null && (
                  <Button variant="ghost" size="sm" onClick={() => manualApply(r)} disabled={busy !== ""}>
                    手动投递
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {runSession && (
        <Card className="p-6">
          <CardTitle>Application Agent{runJob ? ` · ${runJob}` : ""}</CardTitle>
          <ol className="space-y-2 text-sm">
            {runEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                {e.result === "success" ? (
                  <CircleCheck size={15} strokeWidth={1.8} className="shrink-0 text-success" />
                ) : e.result === "waiting_user" ? (
                  <ArrowRight size={15} strokeWidth={1.8} className="shrink-0 text-primary" />
                ) : e.result === "failed" ? (
                  <CircleX size={15} strokeWidth={1.8} className="shrink-0 text-danger" />
                ) : (
                  <Ban size={15} strokeWidth={1.8} className="shrink-0 text-danger" />
                )}
                <span className="text-t1">{ACTION_LABEL[e.action] ?? e.action}</span>
                {e.action === "generate_content" && (
                  <Badge
                    tone={
                      e.detail?.greetingSource === "ai" ? "success" : e.detail?.greetingSource === "template_fallback" ? "warn" : "neutral"
                    }
                    className="h-5 px-2 text-[10.5px]"
                  >
                    {e.detail?.greetingSource === "ai"
                      ? "AI 生成"
                      : e.detail?.greetingSource === "template_fallback"
                        ? "AI 失败→模板"
                        : "模板"}
                  </Badge>
                )}
                {e.action === "generate_content" && typeof e.detail?.greetingError === "string" && (
                  <span className="text-xs text-warn" title={String(e.detail.greetingError)}>
                    {String(e.detail.greetingError).slice(0, 40)}
                  </span>
                )}
                {e.error && <span className="text-xs text-danger">{e.error}</span>}
                {e.action === "wait_user_confirm" && e.result === "waiting_user" && (
                  <span className="text-xs text-primary">等待你的确认…</span>
                )}
              </li>
            ))}
          </ol>
          {runStatus === "awaiting_confirmation" && (
            <div className="mt-3 rounded-xl border border-primary-soft-border bg-primary-soft p-3.5 text-sm">
              <p className="text-t1">Agent 已完成填写，提交前需要你确认（Level 1 半自动投递）。</p>
              {(() => {
                const waitEvent = runEvents.find((e) => e.action === "wait_user_confirm" && e.result === "waiting_user");
                const greeting = waitEvent?.detail?.greeting;
                return typeof greeting === "string" && greeting !== "" ? (
                  <p className="mt-2 rounded-[10px] bg-surface p-2.5 text-t2">
                    <span className="mr-1.5 text-xs text-t3">打招呼语：</span>
                    {greeting}
                  </p>
                ) : null;
              })()}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button variant="success" onClick={() => confirmRun(true)} disabled={busy !== ""}>
                  确认提交
                </Button>
                <Button variant="ghost" onClick={() => confirmRun(false)} disabled={busy !== ""}>
                  拒绝
                </Button>
                <Button
                  variant="ghost"
                  onClick={handoverNow}
                  disabled={busy !== ""}
                  title="Agent 退出该页面，由你自己在平台上完成投递"
                >
                  我自己来投
                </Button>
              </div>
            </div>
          )}
          {runStatus === "submitted" && <p className="mt-3 text-sm font-semibold text-success">投递成功，已进入投递看板</p>}
          {runStatus === "blocked" && (
            <div className="mt-3">
              <p className="text-sm text-danger">{runBlocked}</p>
              {runBlocked.includes("安全验证") && (
                <div className="mt-2 rounded-xl border border-warn-border bg-warn-soft p-3.5">
                  <p className="text-sm font-medium text-warn">需要你完成平台验证：Agent 已暂停，不会自动重试或绕过。</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button onClick={captchaResolved} disabled={busy !== ""}>
                      {busy === "captcha" ? "复检中…" : "我已完成验证"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handoverNow}
                      disabled={busy !== ""}
                      title="Agent 退出，由你自己在平台上完成本次投递"
                    >
                      {busy === "handover" ? "接管中…" : "接管处理"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {runStatus === "handed_over_to_user" && (
            <p className="mt-3 text-sm text-t2">你已接管：Agent 已退出。完成投递后可用「手动投递」或投递看板记录结果。</p>
          )}
        </Card>
      )}
    </div>
  );
}
