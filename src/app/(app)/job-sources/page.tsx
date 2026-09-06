"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Lock, Radar, Sparkles } from "lucide-react";
import { api, waitForTask } from "@/lib/client";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { JobStructured } from "@/shared/types";

interface SourceMeta {
  id: string;
  name: string;
  status: string;
  sourceType: string;
  officialUrl: string | null;
  directLink: boolean;
  capabilities: {
    search: boolean;
    assistedImport: boolean;
    autoApply: string;
    requiresLogin: boolean;
    notes?: string;
  };
}

interface ImportResult {
  job: {
    id: string;
    title: string;
    companyName: string;
    source: string;
    sourceUrl: string | null;
    sourceJobId: string | null;
    fingerprint: string | null;
    city: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    structured: JobStructured | null;
  };
  dedupe: "NEW" | "EXACT_DUPLICATE" | "POSSIBLE_DUPLICATE";
  warnings: string[];
}

interface ResumeOption {
  id: string;
  title: string;
  isPrimary: boolean;
}

interface RadarSiteRun {
  siteId: string;
  siteName: string;
  imported: number;
  duplicates: number;
  filtered: number;
  error?: string;
}

interface RadarRun {
  id: string;
  status: string;
  output: { summary?: { importedTotal?: number; duplicatesTotal?: number; sites?: RadarSiteRun[] } } | null;
  error: string | null;
  provider: string | null;
  model: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<string, { text: string; tone: "success" | "primary" | "warn" | "danger" }> = {
  connected: { text: "已连接", tone: "success" },
  available: { text: "可用", tone: "primary" },
  degraded: { text: "降级", tone: "warn" },
  unavailable: { text: "不可用", tone: "danger" },
};

const AUTO_APPLY_LABEL: Record<string, string> = {
  none: "不支持自动投递",
  assisted: "半自动投递（用户确认）",
  conditional: "条件自动投递",
};

/** 引导式辅助导入的六个步骤 */
const IMPORT_STEPS = [
  "在你的浏览器打开招聘网站",
  "登录你自己的账号",
  "找到目标职位",
  "复制职位 URL",
  "复制职位描述（JD）",
  "粘贴到下面，交给 AI 解析",
];

export default function JobSourcesPage() {
  const router = useRouter();
  const [sources, setSources] = useState<SourceMeta[]>([]);
  const [health, setHealth] = useState<{ id: string; ok: boolean; detail: string }[]>([]);
  const [resumes, setResumes] = useState<ResumeOption[]>([]);
  const [error, setError] = useState("");

  // 导入弹层状态
  const [importSource, setImportSource] = useState<SourceMeta | null>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [matchInfo, setMatchInfo] = useState<{ score: number; matchId: string } | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);
  const [showGaps, setShowGaps] = useState(false);
  const [gaps, setGaps] = useState<{ dimension: string; detail: string }[]>([]);

  // —— 职位雷达（V3.3） ——
  const [radarRuns, setRadarRuns] = useState<RadarRun[]>([]);
  const [radarBusy, setRadarBusy] = useState(false);
  const [radarMsg, setRadarMsg] = useState("");

  async function load() {
    try {
      const [d, rs] = await Promise.all([
        api<{ sources: SourceMeta[]; health: { id: string; ok: boolean; detail: string }[] }>("/job-sources"),
        api<ResumeOption[]>("/resumes"),
      ]);
      setSources(d.sources);
      setHealth(d.health);
      setResumes(rs);
      api<RadarRun[]>("/radar/runs")
        .then(setRadarRuns)
        .catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  function openImport(s: SourceMeta) {
    if (!s.capabilities.assistedImport) {
      setError(`${s.name} 暂不支持导入`);
      return;
    }
    setImportSource(s);
    setUrl("");
    setText("");
    setCompanyName("");
    setResult(null);
    setMatchInfo(null);
    setShowGaps(false);
    setImportError("");
  }

  async function doImport() {
    if (!importSource) return;
    setBusy(true);
    setImportError("");
    setResult(null);
    setMatchInfo(null);
    try {
      const r = await api<ImportResult>(`/job-sources/${importSource.id}/import`, {
        method: "POST",
        body: {
          url: url || undefined,
          text: text || undefined,
          rawData: companyName ? { companyName } : undefined,
        },
      });
      setResult(r);
      // 导入后自动用主简历计算匹配度（Level 0 闭环）
      const primary = resumes.find((x) => x.isPrimary) ?? resumes[0];
      if (primary) {
        setMatchBusy(true);
        try {
          const m = await api<{ match: { id: string; totalScore: number } }>("/matches", {
            method: "POST",
            body: { jobId: r.job.id, resumeId: primary.id, useAI: false },
          });
          setMatchInfo({ score: Math.round(m.match.totalScore), matchId: m.match.id });
        } catch {
          /* 匹配失败不打断导入结果 */
        } finally {
          setMatchBusy(false);
        }
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function showGapDetail() {
    if (!matchInfo) return;
    if (gaps.length > 0) {
      setShowGaps(false);
      return;
    }
    try {
      const m = await api<{ gaps: { dimension: string; detail: string }[] }>(`/matches/${matchInfo.matchId}`);
      setGaps(m.gaps ?? []);
      setShowGaps(true);
    } catch {
      /* ignore */
    }
  }

  async function runRadar() {
    setRadarBusy(true);
    setRadarMsg("扫描中：抓取公开招聘页 → AI 结构化抽取 → 去重入库…");
    try {
      const { taskId } = await api<{ taskId: string }>("/radar/run", { method: "POST" });
      await waitForTask(taskId, 120_000);
      const runs = await api<RadarRun[]>("/radar/runs");
      setRadarRuns(runs);
      const s = runs[0]?.output?.summary;
      setRadarMsg(
        s
          ? `扫描完成：新入库 ${s.importedTotal ?? 0} 个职位，重复跳过 ${s.duplicatesTotal ?? 0} 个（结果见职位中心，来源=职位雷达）`
          : "扫描完成",
      );
    } catch (e) {
      setRadarMsg(e instanceof Error ? e.message : "扫描失败");
    } finally {
      setRadarBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="职位来源"
        desc="点击任意来源即可把职位带入 JobHunter；平台没有公开 API 时由你复制 URL + JD，AI 负责理解、分析与管理"
      />

      <Card className="p-5">
        <CardTitle
          right={
            <Button size="sm" onClick={runRadar} disabled={radarBusy}>
              <Radar size={13} strokeWidth={1.8} className={radarBusy ? "animate-spin" : ""} />
              {radarBusy ? "扫描中…" : "立即扫描"}
            </Button>
          }
        >
          职位雷达
        </CardTitle>
        <p className="text-xs leading-relaxed text-t3">
          按「设置 → 求职条件」自动扫描公开招聘页（v1：猎聘校招企业列表），AI 结构化抽取 +
          三级去重后入库；只入库、不投递，全程审计。需要先在设置页配置自备大模型。
        </p>
        {radarMsg && <p className="mt-2 text-xs text-t2">{radarMsg}</p>}
        {radarRuns.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {radarRuns.slice(0, 5).map((r) => {
              const s = r.output?.summary;
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-t3">
                  <Badge
                    tone={r.status === "succeeded" ? "success" : r.status === "failed" ? "danger" : "warn"}
                  >
                    {r.status === "succeeded" ? "完成" : r.status === "failed" ? "失败" : "进行中"}
                  </Badge>
                  <span>{new Date(r.createdAt).toLocaleString("zh-CN")}</span>
                  {s && (
                    <span>
                      入库 {s.importedTotal ?? 0} · 重复 {s.duplicatesTotal ?? 0}
                      {(s.sites ?? []).map((x) =>
                        x.error ? ` · ${x.siteName}：${x.error.slice(0, 40)}` : "",
                      )}
                    </span>
                  )}
                  {!s && r.error && <span className="text-danger">{r.error.slice(0, 80)}</span>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {sources.map((s) => {
          const st = STATUS_TONE[s.status] ?? STATUS_TONE.available;
          const h = health.find((x) => x.id === s.id);
          const importable = s.capabilities.assistedImport;
          return (
            <Card
              key={s.id}
              className={`p-5 transition-colors ${
                importable ? "cursor-pointer hover:border-primary-soft-border" : "opacity-80"
              }`}
            >
              <div onClick={() => importable && openImport(s)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-t1">{s.name}</span>
                    {s.directLink && s.officialUrl && (
                      <a
                        href={s.officialUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 text-xs text-primary hover:text-primary-hover"
                        title={`打开 ${s.name} 官网`}
                      >
                        {s.name} ↗
                      </a>
                    )}
                  </div>
                  <Badge tone={st.tone}>{st.text}</Badge>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      s.capabilities.search ? "bg-success-soft text-success" : "bg-surface-2 text-t3"
                    }`}
                  >
                    {s.capabilities.search ? "可搜索" : "不可搜索"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      s.capabilities.assistedImport ? "bg-success-soft text-success" : "bg-surface-2 text-t3"
                    }`}
                  >
                    {s.capabilities.assistedImport ? "辅助导入" : "不支持导入"}
                  </span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-t2">
                    {AUTO_APPLY_LABEL[s.capabilities.autoApply] ?? s.capabilities.autoApply}
                  </span>
                  {s.capabilities.requiresLogin && (
                    <span className="rounded-full bg-warn-soft px-2 py-0.5 text-warn">需用户自行登录</span>
                  )}
                </div>
                {s.capabilities.notes && <p className="mt-2.5 text-xs leading-relaxed text-t3">{s.capabilities.notes}</p>}
                {h && <p className="mt-1 text-xs text-t3/70">健康检查：{h.detail}</p>}
                {importable && (
                  <Button
                    size="sm"
                    className="mt-3.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      openImport(s);
                    }}
                  >
                    <Download size={13} strokeWidth={1.8} />
                    导入职位
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
        {error && (
          <p className="rounded-[10px] border border-danger-border bg-danger-soft px-3.5 py-2.5 text-sm text-danger md:col-span-2">{error}</p>
        )}
        {sources.length === 0 && !error && (
          <Card className="md:col-span-2">
            <EmptyState icon={Download} title="暂无可用来源" hint="稍后再试，或联系管理员配置" />
          </Card>
        )}
      </div>

      {importSource && (
        <Modal onClose={() => setImportSource(null)} title={`从 ${importSource.name} 导入职位`} size="lg">
          {/* 六步引导 */}
          <div className="rounded-xl bg-surface-2 p-3.5 text-xs leading-relaxed text-t2">
            <p className="mb-1 font-semibold text-t1">{importSource.name} 没有公开 API，按下面的步骤操作：</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              {IMPORT_STEPS.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>

          {/* 隐私说明 */}
          <div className="mt-3 rounded-xl border border-success-border bg-success-soft p-3.5 text-xs leading-relaxed text-success">
            <p className="flex items-center gap-1.5 font-semibold">
              <Lock size={13} strokeWidth={1.8} />
              隐私说明
            </p>
            <p className="mt-1">JobHunter 不需要你的招聘平台账号密码。</p>
            <p>不保存招聘平台 Cookie、Session、Token 或任何登录凭证。</p>
            <p>你只需要提供职位 URL 和职位描述。</p>
          </div>

          {!result ? (
            <>
              <div className="mt-4 grid gap-3">
                <Field label="职位 URL">
                  <Input
                    placeholder={`https://…（${importSource.name} 职位详情页链接）`}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </Field>
                <Field label="公司名称" hint="可选，JD 中未写明时填写">
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </Field>
                <Field label="职位描述 / JD">
                  <Textarea rows={7} placeholder="粘贴完整 JD…" value={text} onChange={(e) => setText(e.target.value)} />
                </Field>
              </div>
              {importError && (
                <p className="mt-2.5 rounded-[10px] border border-danger-border bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                  {importError}
                </p>
              )}
              <Button onClick={doImport} disabled={busy} className="mt-4 w-full" size="lg">
                <Sparkles size={14} strokeWidth={1.8} />
                {busy ? "AI 解析中…" : "AI 解析职位"}
              </Button>
            </>
          ) : (
            <div className="mt-4">
              <p className="text-[15px] font-bold text-t1">职位解析完成</p>
              {result.warnings.map((w, i) => (
                <p key={i} className="mt-1 text-xs text-warn">⚠ {w}</p>
              ))}
              <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <Info label="公司" value={result.job.companyName} />
                <Info label="岗位" value={result.job.title} />
                <Info
                  label="地点 / 薪资"
                  value={`${result.job.city ?? "—"}${result.job.salaryMax ? ` · ${result.job.salaryMin ?? "?"}-${result.job.salaryMax}K` : ""}`}
                />
                <Info
                  label="经验 / 学历"
                  value={`${result.job.structured?.experienceYearsMin ? `${result.job.structured.experienceYearsMin} 年` : "不限"} · ${result.job.structured?.education ?? "不限"}`}
                />
              </dl>
              {(result.job.structured?.skills ?? []).length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {result.job.structured!.skills.map((s) => (
                    <span key={s.name} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-t2">
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
              {matchInfo ? (
                <div className="mt-3 rounded-xl border border-primary-soft-border bg-primary-soft p-3.5 text-sm">
                  <p className="font-semibold text-primary">与主简历匹配度：{matchInfo.score}/100</p>
                  <button onClick={showGapDetail} className="mt-1 text-xs text-primary underline-offset-2 hover:underline">
                    {showGaps ? "收起差距分析" : "查看分析（差距清单）"}
                  </button>
                  {showGaps && (
                    <ul className="mt-1.5 list-disc pl-4 text-xs text-t2">
                      {gaps.map((g, i) => (
                        <li key={i}>{g.detail}</li>
                      ))}
                      {gaps.length === 0 && <li>未发现明显差距</li>}
                    </ul>
                  )}
                </div>
              ) : (
                matchBusy && <p className="mt-3 text-sm text-t3">正在计算与主简历的匹配度…</p>
              )}
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <Badge tone="success">已加入我的职位</Badge>
                <Button
                  size="sm"
                  onClick={() => {
                    setImportSource(null);
                    router.push("/discovery");
                  }}
                >
                  准备投递
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImportSource(null);
                    router.push("/jobs");
                  }}
                >
                  查看我的职位
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-t3">{label}</dt>
      <dd className="truncate font-medium text-t1" title={value}>
        {value}
      </dd>
    </div>
  );
}
