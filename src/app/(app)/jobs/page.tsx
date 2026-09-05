"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, FileText, Plus, Search, Sparkles, Star, Target } from "lucide-react";
import { api, waitForTask } from "@/lib/client";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { ScoreBadge } from "@/components/ui/score-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { JobStructured } from "@/shared/types";

interface JobRow {
  id: string;
  companyName: string;
  title: string;
  city: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string;
  structured: JobStructured | null;
  status: string;
  createdAt: string;
  sourceUrl?: string | null;
  source?: string | null;
}

interface MatchRow {
  id: string;
  jobId: string;
  resumeId: string;
  totalScore: number;
}

interface ResumeOption {
  id: string;
  title: string;
  isPrimary: boolean;
}

export default function JobsPage() {
  const router = useRouter();
  const [list, setList] = useState<JobRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [resumes, setResumes] = useState<ResumeOption[]>([]);
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [matchJob, setMatchJob] = useState<JobRow | null>(null);
  const [matchResume, setMatchResume] = useState("");
  const [matchResult, setMatchResult] = useState<string>("");

  // 新增职位表单
  const [jdText, setJdText] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [structured, setStructured] = useState<JobStructured | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const [jobs, ms, rs] = await Promise.all([
        api<JobRow[]>(`/jobs${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ""}`),
        api<MatchRow[]>("/matches"),
        api<ResumeOption[]>("/resumes"),
      ]);
      setList(jobs);
      setMatches(ms);
      setResumes(rs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function parseJd() {
    if (jdText.trim().length < 10) {
      setError("请先粘贴完整的 JD 文本（至少 10 字）");
      return;
    }
    setBusy("parse");
    setError("");
    try {
      const { taskId } = await api<{ taskId: string }>("/jobs/parse", {
        method: "POST",
        body: { text: jdText },
      });
      const task = await waitForTask(taskId, 60000);
      const s = task.output?.structured as JobStructured;
      setStructured(s);
      setTitle(s.title ?? "");
      setCity(s.city ?? "");
      setSalaryMin(s.salaryMin != null ? String(s.salaryMin) : "");
      setSalaryMax(s.salaryMax != null ? String(s.salaryMax) : "");
      if (!companyName) setCompanyName("");
      setMsg("AI 解析完成，请确认并补充公司名后保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析失败");
    } finally {
      setBusy("");
    }
  }

  async function saveJob() {
    if (!companyName.trim() || !title.trim() || !jdText.trim()) {
      setError("公司名、职位名与 JD 描述为必填");
      return;
    }
    setBusy("save");
    setError("");
    try {
      await api("/jobs", {
        method: "POST",
        body: {
          companyName,
          title,
          city: city || undefined,
          salaryMin: salaryMin ? Number(salaryMin) : undefined,
          salaryMax: salaryMax ? Number(salaryMax) : undefined,
          description: jdText,
          structured: structured ?? undefined,
        },
      });
      setShowAdd(false);
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy("");
    }
  }

  function resetForm() {
    setJdText("");
    setCompanyName("");
    setTitle("");
    setCity("");
    setSalaryMin("");
    setSalaryMax("");
    setStructured(null);
    setMsg("");
  }

  async function toggleFav(job: JobRow) {
    await api(`/jobs/${job.id}/favorite`, { method: "POST" });
    await load();
  }

  async function doMatch() {
    if (!matchResume) {
      setMatchResult("请选择简历");
      return;
    }
    setBusy("match");
    setMatchResult("");
    try {
      const { match } = await api<{ match: MatchRow }>("/matches", {
        method: "POST",
        body: { jobId: matchJob!.id, resumeId: matchResume, useAI: false },
      });
      setMatchResult(`匹配得分 ${match.totalScore} 分，已保存到匹配记录`);
      await load();
    } catch (e) {
      setMatchResult(e instanceof Error ? e.message : "匹配失败");
    } finally {
      setBusy("");
    }
  }

  function scoreOf(jobId: string): number | null {
    const m = matches.filter((x) => x.jobId === jobId).sort((a, b) => b.totalScore - a.totalScore)[0];
    return m ? Math.round(m.totalScore) : null;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="职位中心"
        desc="粘贴 JD 让 AI 结构化建档，一键匹配你的简历"
        right={
          <Button onClick={() => setShowAdd(true)}>
            <Plus />
            粘贴 JD 添加职位
          </Button>
        }
      />

      <div className="flex max-w-xl items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} strokeWidth={1.7} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-t3" />
          <Input
            className="pl-10"
            placeholder="搜索职位 / 公司 / JD 关键词"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
        </div>
        <Button variant="ghost" onClick={load}>
          搜索
        </Button>
      </div>
      {error && (
        <p className="rounded-[10px] border border-danger-border bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((job) => {
          const score = scoreOf(job.id);
          return (
            <Card key={job.id} className="p-5 transition-colors hover:border-primary-soft-border">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-t1">
                    {job.title}
                    <span className="ml-2 text-[12.5px] font-normal text-t3">{job.companyName}</span>
                  </p>
                  <p className="mt-0.5 text-[12.5px] font-medium text-success">
                    {job.city ?? "—"}
                    {job.salaryMin ? ` · ${job.salaryMin}-${job.salaryMax}K` : ""}
                  </p>
                  {job.sourceUrl && (
                    <p className="mt-0.5 text-xs text-t3">
                      来源：
                      <a href={job.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:text-primary-hover">
                        {job.source} ↗
                      </a>
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {score != null && <ScoreBadge score={score} />}
                  <button
                    onClick={() => toggleFav(job)}
                    title="收藏"
                    aria-label="收藏"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-t3 transition hover:bg-warn-soft hover:text-warn"
                  >
                    <Star size={16} strokeWidth={1.7} />
                  </button>
                </div>
              </div>
              {job.structured?.skills && job.structured.skills.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {job.structured.skills.slice(0, 6).map((s) => (
                    <span key={s.name} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-t2">
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-t3">{job.description}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => {
                    setMatchJob(job);
                    setMatchResult("");
                    setMatchResume(resumes.find((r) => r.isPrimary)?.id ?? resumes[0]?.id ?? "");
                  }}
                >
                  <Target size={14} strokeWidth={1.7} />
                  匹配我的简历
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const primary = resumes.find((r) => r.isPrimary) ?? resumes[0];
                    if (!primary) {
                      setError("请先在「简历工作台」创建一份简历");
                      return;
                    }
                    router.push(`/resumes/${primary.id}?tailor=${job.id}`);
                  }}
                >
                  <FileText size={14} strokeWidth={1.7} />
                  生成针对性简历
                </Button>
              </div>
            </Card>
          );
        })}
        {list.length === 0 && (
          <Card className="lg:col-span-2">
            <EmptyState
              icon={Briefcase}
              title="暂无职位"
              hint="点击右上角「粘贴 JD 添加职位」，AI 会自动结构化录入"
            />
          </Card>
        )}
      </div>

      {showAdd && (
        <Modal onClose={() => setShowAdd(false)} title="粘贴 JD 添加职位" size="lg">
          <div className="space-y-4">
            <Textarea
              rows={6}
              placeholder="粘贴完整 JD 原文…"
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
            />
            <div>
              <Button onClick={parseJd} disabled={busy !== ""}>
                <Sparkles size={14} strokeWidth={1.8} />
                {busy === "parse" ? "AI 解析中…" : "AI 解析 JD"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Field label="公司名 *">
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </Field>
              <Field label="职位名 *">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="城市">
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field label="薪资下限 (K)">
                <Input value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
              </Field>
              <Field label="薪资上限 (K)">
                <Input value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
              </Field>
            </div>
            {structured && (
              <div className="rounded-[10px] border border-success-border bg-success-soft px-3.5 py-2.5 text-xs leading-relaxed text-success">
                AI 已解析出 {structured.skills.length} 项技能要求
                {structured.experienceYearsMin ? `、${structured.experienceYearsMin} 年经验` : ""}
                {structured.education ? `、${structured.education}学历` : ""}
                ，可手动修正后保存。
              </div>
            )}
            {msg && <p className="text-sm text-t2">{msg}</p>}
            {error && (
              <p className="rounded-[10px] border border-danger-border bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
            )}
            <Button onClick={saveJob} disabled={busy !== ""} className="w-full" size="lg">
              {busy === "save" ? "保存中…" : "保存职位"}
            </Button>
          </div>
        </Modal>
      )}

      {matchJob && (
        <Modal onClose={() => setMatchJob(null)} title={`匹配：${matchJob.title} · ${matchJob.companyName}`}>
          <div className="space-y-4">
            <Field label="选择简历">
              <Select value={matchResume} onChange={(e) => setMatchResume(e.target.value)}>
                <option value="">请选择…</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                    {r.isPrimary ? "（主简历）" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={doMatch} disabled={busy !== ""} className="w-full" size="lg">
              {busy === "match" ? "匹配计算中…" : "开始匹配"}
            </Button>
            {matchResult && <p className="text-center text-sm font-semibold text-success">{matchResult}</p>}
            <p className="text-center text-xs text-t3">
              匹配结果与差距分析可在 <Link href="/dashboard" className="text-primary">仪表盘</Link> 查看趋势
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
