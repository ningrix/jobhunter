"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, RotateCcw, Save, Sparkles, Target } from "lucide-react";
import { api, waitForTask } from "@/lib/client";
import { ResumePreview } from "@/components/resume/ResumePreview";
import { RESUME_TEMPLATE_LIST } from "@/components/resume/templates";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/score-ring";
import { Loading } from "@/components/ui/spinner";
import { inputBase } from "@/components/ui/field";
import { diffChars, type DiffSegment } from "@/lib/text-diff";
import type { ResumeContent, ResumeStyle, ResumeTailorResult } from "@/shared/types";
import { DEFAULT_RESUME_STYLE } from "@/shared/types";

interface VersionRow {
  id: string;
  versionNo: number;
  source: string;
  note: string | null;
  content: ResumeContent;
  createdAt: string;
}

interface Analysis {
  id: string;
  score: number;
  issues: string[];
  suggestions: { section: string; before: string; after: string; reason: string }[];
}

interface JobOption {
  id: string;
  title: string;
  companyName: string;
}

interface EditSuggestion {
  section: string;
  before: string;
  after: string;
  reason: string;
}

interface FileInfo {
  fileName: string;
  filePath: string;
  fileId: string;
  parseStatus: "pending" | "done" | "failed";
  parseError: string | null;
}

const GAP_CATEGORY_LABEL: Record<string, string> = {
  presentation: "展示优化",
  weak_evidence: "证据薄弱",
  adjacent_skill: "相近技能",
  true_gap: "真实缺口",
};

const selectCls =
  "h-9 rounded-[10px] border border-border-strong bg-surface px-2.5 text-sm text-t1 outline-none transition-colors focus:border-primary";

export default function ResumeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [current, setCurrent] = useState<VersionRow | null>(null);
  const [content, setContent] = useState<ResumeContent | null>(null);
  const [style, setStyle] = useState<ResumeStyle>(DEFAULT_RESUME_STYLE);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);

  // AI 建议逐条决策状态（V3.1 B4）：accepted / rejected / edited-after
  const [suggestionState, setSuggestionState] = useState<
    Record<number, { decision: "accepted" | "rejected"; after: string }>
  >({});

  // V3.1 B5：JD → 简历定制
  const [showTailor, setShowTailor] = useState(false);
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [tailorJobId, setTailorJobId] = useState("");
  const [tailorBusy, setTailorBusy] = useState(false);
  const [tailorError, setTailorError] = useState("");
  const [tailor, setTailor] = useState<ResumeTailorResult | null>(null);
  const [tailorEditState, setTailorEditState] = useState<
    Record<number, { decision: "accepted" | "rejected"; after: string }>
  >({});

  function pick(v: VersionRow, styleFromResume?: ResumeStyle) {
    setCurrent(v);
    setContent(JSON.parse(JSON.stringify(v.content)));
    setAnalysis(null);
    setSuggestionState({});
    if (styleFromResume) setStyle(styleFromResume);
    api<Analysis>(`/resumes/${id}/analysis?versionId=${v.id}`)
      .then(setAnalysis)
      .catch(() => setAnalysis(null));
  }

  async function load() {
    const d = await api<{
      resume: { title: string; style: ResumeStyle | null };
      versions: VersionRow[];
    }>(`/resumes/${id}`);
    setVersions(d.versions);
    pick(d.versions[0], d.resume.style ?? undefined);
    api<Record<string, FileInfo>>("/resumes/file-infos")
      .then((m) => setFileInfo(m[id as string] ?? null))
      .catch(() => setFileInfo(null));
  }

  async function reparse() {
    setBusy("reparse");
    setMsg("");
    try {
      const r = await api<{ status: "pending" | "failed"; taskId?: string; error?: string }>(
        `/resumes/${id}/reparse`,
        { method: "POST" },
      );
      if (r.status === "pending" && r.taskId) {
        setMsg("重新解析中…");
        await waitForTask(r.taskId, 60000).catch(() => undefined);
        await load();
        setMsg("重新解析已结束，可查看最新状态");
      } else {
        setMsg(`重新解析失败：${r.error ?? "未知原因"}`);
        await load();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "重新解析失败");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    // 支持 /resumes/:id?tailor=<jobId> 直达（职位卡「定制简历」入口）
    const params = new URLSearchParams(window.location.search);
    const jobParam = params.get("tailor");
    if (jobParam) {
      setTailorJobId(jobParam);
      setShowTailor(true);
      api<JobOption[]>("/jobs")
        .then((jobs) => {
          setJobOptions(jobs.map((j) => ({ id: j.id, title: j.title, companyName: j.companyName })));
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function openTailor() {
    setShowTailor(true);
    setTailorError("");
    if (jobOptions.length === 0) {
      try {
        const jobs = await api<{ id: string; title: string; companyName: string }[]>("/jobs");
        setJobOptions(jobs.map((j) => ({ id: j.id, title: j.title, companyName: j.companyName })));
        if (jobs.length === 0) setTailorError("暂无职位：先到「职位来源」导入一个目标职位");
        else if (!tailorJobId) setTailorJobId(jobs[0].id);
      } catch (e) {
        setTailorError(e instanceof Error ? e.message : "加载职位失败");
      }
    }
  }

  async function startTailor() {
    if (!tailorJobId) {
      setTailorError("请选择目标职位");
      return;
    }
    setTailorBusy(true);
    setTailorError("");
    setTailor(null);
    setTailorEditState({});
    try {
      const { taskId } = await api<{ taskId: string }>(`/resumes/${id}/tailor`, {
        method: "POST",
        body: { jobId: tailorJobId },
      });
      const task = await waitForTask(taskId, 60000);
      const tailor = (task.output as { tailor: ResumeTailorResult }).tailor;
      setTailor(tailor);
    } catch (e) {
      setTailorError(e instanceof Error ? e.message : "定制分析失败");
    } finally {
      setTailorBusy(false);
    }
  }

  /** 文本改写应用（AI 建议 / JD 定制措辞共用）：不引入原文之外的新事实由 AI 场景约束 + 用户把关 */
  function applyTextEdit(s: { section: string; before: string; after: string }) {
    const next = JSON.parse(JSON.stringify(content)) as ResumeContent;
    if (s.section === "summary") {
      next.summary = s.before ? next.summary?.replace(s.before, s.after) ?? s.after : s.after;
      next.basics.summary = next.summary;
    } else if (s.section === "skills") {
      const list = s.before.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
      const afterList = s.after.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
      next.skills = next.skills.map((sk) => {
        const i = list.indexOf(sk);
        return i >= 0 && afterList[i] ? afterList[i] : sk;
      });
      for (const a of afterList) if (!next.skills.includes(a)) next.skills.push(a);
    } else {
      const replaceIn = (obj: { [k: string]: unknown }) => {
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (typeof v === "string" && s.before && v.includes(s.before)) obj[k] = v.replace(s.before, s.after);
          if (Array.isArray(v)) {
            v.forEach((item, i) => {
              if (typeof item === "string" && item.includes(s.before)) (v as string[])[i] = item.replace(s.before, s.after);
            });
          }
        }
      };
      next.experience.forEach((e) => replaceIn(e as unknown as { [k: string]: unknown }));
      next.projects.forEach((p) => replaceIn(p as unknown as { [k: string]: unknown }));
      next.education.forEach((e) => replaceIn(e as unknown as { [k: string]: unknown }));
    }
    setContent(next);
  }

  if (!content || !current) return <Loading text={`加载中…${msg}`} />;

  const patch = (p: Partial<ResumeContent>) => setContent({ ...content, ...p });
  const patchBasics = (p: Partial<ResumeContent["basics"]>) =>
    setContent({ ...content, basics: { ...content.basics, ...p } });

  const setExp = (i: number, item: Partial<ResumeContent["experience"][number]>) =>
    patch({ experience: content.experience.map((x, j) => (j === i ? { ...x, ...item } : x)) });
  const setEdu = (i: number, item: Partial<ResumeContent["education"][number]>) =>
    patch({ education: content.education.map((x, j) => (j === i ? { ...x, ...item } : x)) });
  const setProj = (i: number, item: Partial<ResumeContent["projects"][number]>) =>
    patch({ projects: content.projects.map((x, j) => (j === i ? { ...x, ...item } : x)) });

  async function saveStyle() {
    setBusy("style");
    setMsg("");
    try {
      await api(`/resumes/${id}`, { method: "PATCH", body: { style } });
      setMsg("样式已保存 ✅");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存样式失败");
    } finally {
      setBusy("");
    }
  }

  async function saveAsVersion(note: string, source: "manual" | "ai") {
    if (!current) return;
    setBusy("save");
    setMsg("");
    try {
      await api(`/resumes/${id}/versions`, {
        method: "POST",
        body: { content, note, source },
      });
      await load();
      setMsg("已保存为新版本 ✅");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy("");
    }
  }

  async function optimize() {
    if (!current) return;
    setBusy("optimize");
    setMsg("AI 优化分析中…");
    try {
      const { taskId } = await api<{ taskId: string }>(`/resumes/${id}/optimize`, {
        method: "POST",
        body: { versionId: current.id },
      });
      await waitForTask(taskId, 60000);
      setAnalysis(await api<Analysis>(`/resumes/${id}/analysis?versionId=${current.id}`));
      setSuggestionState({});
      setMsg("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "优化失败");
    } finally {
      setBusy("");
    }
  }

  /** V3.1 B4：把「已接受」的建议应用到当前内容（after 可被用户编辑） */
  function applySuggestion(idx: number, decision: "accepted" | "rejected", editedAfter?: string) {
    if (!analysis) return;
    const s = analysis.suggestions[idx];
    const after = editedAfter ?? s.after;
    setSuggestionState((prev) => ({ ...prev, [idx]: { decision, after } }));
    if (decision === "accepted") applyTextEdit(s);
    if (decision === "accepted") setMsg("建议已应用（预览实时更新），记得保存为新版本");
  }

  return (
    <div className="space-y-4">
      {/* 工具行（打印隐藏） */}
      <div className="flex flex-wrap items-center gap-3 print-hidden">
        <h1 className="text-[23px] font-bold text-t1">
          Resume Builder <span className="text-t3">· v{current.versionNo}</span>
        </h1>
        <select className={selectCls} value={current.id} onChange={(e) => pick(versions.find((v) => v.id === e.target.value)!)}>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.versionNo} · {v.source === "upload" ? "上传解析" : v.source === "ai" ? "AI 优化" : "手动"}
              {v.note ? ` · ${v.note}` : ""}
            </option>
          ))}
        </select>
        <Button onClick={optimize} disabled={busy !== ""}>
          <Sparkles size={14} strokeWidth={1.8} />
          {busy === "optimize" ? "AI 分析中…" : "AI 优化建议"}
        </Button>
        <Button variant="soft" onClick={openTailor} disabled={busy !== ""}>
          <Target size={14} strokeWidth={1.7} />
          针对职位定制
        </Button>
        <Button variant="ghost" onClick={() => saveAsVersion(`基于 v${current.versionNo} 修改`, "manual")} disabled={busy !== ""}>
          <Save size={14} strokeWidth={1.7} />
          保存为新版本
        </Button>
        {msg && <span className="text-sm text-t2">{msg}</span>}
      </div>

      {/* Stage B：上传文件信息条（本地路径/打开原文件/解析状态/重新解析） */}
      {fileInfo && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border bg-surface-2 px-4 py-3 text-[12.5px] text-t2 print-hidden">
          <Badge
            tone={
              fileInfo.parseStatus === "done" ? "success" : fileInfo.parseStatus === "pending" ? "warn" : "danger"
            }
          >
            {fileInfo.parseStatus === "done"
              ? "已解析"
              : fileInfo.parseStatus === "pending"
                ? "解析中"
                : "解析失败"}
          </Badge>
          <span className="min-w-0 flex-1 truncate" title={fileInfo.filePath}>
            {fileInfo.fileName} · 本地 {fileInfo.filePath}
          </span>
          <a
            href={`/api/v1/files/${fileInfo.fileId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Download size={13} /> 打开原文件
          </a>
          <Button variant="ghost" size="sm" onClick={reparse} disabled={busy !== ""}>
            <RotateCcw size={13} /> 重新解析
          </Button>
          {fileInfo.parseStatus === "failed" && fileInfo.parseError && (
            <span className="w-full text-xs text-danger">失败原因：{fileInfo.parseError}</span>
          )}
          {fileInfo.parseStatus !== "done" && (
            <span className="w-full text-xs text-t3">
              未完成结构化解析：匹配评分与 AI 优化暂不可用；解析成功后自动解锁。
            </span>
          )}
        </div>
      )}

      {/* AI 诊断 + 逐条建议（打印隐藏） */}
      {analysis && (
        <Card className="p-6 print-hidden">
          <div className="flex flex-wrap items-center gap-4">
            <ScoreRing score={analysis.score} size={72} stroke={9} caption="AI 诊断" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-t1">AI 简历诊断</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-t2">
                {analysis.issues.map((i, idx) => (
                  <li key={idx}>{i}</li>
                ))}
                {analysis.issues.length === 0 && <li>整体结构良好，暂未发现明显问题</li>}
              </ul>
            </div>
          </div>
          {analysis.suggestions.length > 0 && (
            <div className="mt-4 space-y-2">
              {analysis.suggestions.map((s, idx) => {
                const st = suggestionState[idx];
                return (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3.5 text-sm transition-colors ${
                      st?.decision === "accepted"
                        ? "border-success-border bg-success-soft"
                        : st?.decision === "rejected"
                          ? "border-border bg-surface-2 opacity-60"
                          : "border-border bg-surface-2"
                    }`}
                  >
                    <Badge tone="primary" className="h-5 px-2 text-[10.5px]">
                      {s.section}
                    </Badge>
                    {s.before && (
                      <div className="mt-2 rounded-[10px] bg-surface p-2.5">
                        <p className="mb-1 text-[10.5px] font-medium text-t3">原文</p>
                        <DiffText before={s.before} after={st?.after ?? s.after} />
                      </div>
                    )}
                    {st?.decision === "accepted" ? (
                      <p className="mt-1 text-success">已应用：{st.after}</p>
                    ) : st?.decision === "rejected" ? (
                      <p className="mt-1 text-t3">已拒绝</p>
                    ) : (
                      <>
                        <div className="mt-2 rounded-[10px] border border-border bg-surface p-2.5">
                          <p className="mb-1 text-[10.5px] font-medium text-t3">改写后（可直接编辑）</p>
                          <textarea
                            className="w-full bg-transparent text-sm text-t1 outline-none"
                            rows={2}
                            value={st?.after ?? s.after}
                            onChange={(e) =>
                              setSuggestionState((prev) => ({
                                ...prev,
                                [idx]: { decision: "accepted", after: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div className="mt-1.5 rounded-[10px] bg-primary-soft p-2.5">
                          <p className="mb-0.5 text-[10.5px] font-medium text-t3">依据</p>
                          <p className="text-xs text-t2">{s.reason}</p>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button variant="success" size="sm" onClick={() => applySuggestion(idx, "accepted", st?.after)}>
                            接受
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => applySuggestion(idx, "rejected")}>
                            拒绝
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              <Button
                onClick={() =>
                  saveAsVersion(`AI 优化（采纳 ${Object.values(suggestionState).filter((s) => s.decision === "accepted").length} 条建议）`, "ai")
                }
                disabled={busy !== ""}
              >
                把当前内容保存为新版本（AI 优化）
              </Button>
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_560px]">
        {/* 左：内容编辑（打印隐藏） */}
        <div className="space-y-4 print-hidden">
          <Card className="space-y-3 p-6">
            <h2 className="text-[15px] font-bold text-t1">基本信息</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="姓名" value={content.basics.name} onChange={(v) => patchBasics({ name: v })} />
              <Field label="意向岗位" value={content.basics.title} onChange={(v) => patchBasics({ title: v })} />
              <Field label="手机" value={content.basics.phone} onChange={(v) => patchBasics({ phone: v })} />
              <Field label="邮箱" value={content.basics.email} onChange={(v) => patchBasics({ email: v })} />
              <Field label="城市" value={content.basics.city} onChange={(v) => patchBasics({ city: v })} />
            </div>
            <Area label="个人优势" value={content.summary ?? ""} onChange={(v) => patch({ summary: v })} />
            <Field
              label="技能（逗号分隔）"
              value={content.skills.join("，")}
              onChange={(v) => patch({ skills: v.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })}
            />
          </Card>

          <Card className="space-y-3 p-6">
            <h2 className="text-[15px] font-bold text-t1">工作经历</h2>
            {content.experience.map((exp, i) => (
              <div key={i} className="rounded-xl bg-surface-2 p-3.5 text-sm">
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="公司" value={exp.company} onChange={(v) => setExp(i, { company: v })} />
                  <Field label="职位" value={exp.title} onChange={(v) => setExp(i, { title: v })} />
                  <Field label="开始" value={exp.start} onChange={(v) => setExp(i, { start: v })} />
                  <Field label="结束" value={exp.end} onChange={(v) => setExp(i, { end: v })} />
                </div>
                <Area
                  label="亮点（每行一条）"
                  value={exp.highlights.join("\n")}
                  onChange={(v) => setExp(i, { highlights: v.split("\n").filter(Boolean) })}
                />
                <button
                  className="mt-1 text-xs text-danger/70 transition hover:text-danger"
                  onClick={() => patch({ experience: content.experience.filter((_, j) => j !== i) })}
                >
                  删除该段经历
                </button>
              </div>
            ))}
            <button
              className="text-sm font-medium text-primary transition hover:text-primary-hover"
              onClick={() =>
                patch({ experience: [...content.experience, { company: "", title: "", start: "", end: "", highlights: [] }] })
              }
            >
              + 添加经历
            </button>
          </Card>

          <Card className="space-y-3 p-6">
            <h2 className="text-[15px] font-bold text-t1">教育背景</h2>
            {content.education.map((edu, i) => (
              <div key={i} className="rounded-xl bg-surface-2 p-3.5 text-sm">
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="学校" value={edu.school} onChange={(v) => setEdu(i, { school: v })} />
                  <Field label="专业" value={edu.major} onChange={(v) => setEdu(i, { major: v })} />
                  <Field label="学历" value={edu.degree} onChange={(v) => setEdu(i, { degree: v })} />
                  <Field label="毕业年份" value={edu.end} onChange={(v) => setEdu(i, { end: v })} />
                </div>
                <button
                  className="mt-1 text-xs text-danger/70 transition hover:text-danger"
                  onClick={() => patch({ education: content.education.filter((_, j) => j !== i) })}
                >
                  删除
                </button>
              </div>
            ))}
            <button
              className="text-sm font-medium text-primary transition hover:text-primary-hover"
              onClick={() =>
                patch({ education: [...content.education, { school: "", major: "", degree: "本科", start: "", end: "" }] })
              }
            >
              + 添加教育经历
            </button>
          </Card>

          <Card className="space-y-3 p-6">
            <h2 className="text-[15px] font-bold text-t1">项目经历</h2>
            {content.projects.map((p, i) => (
              <div key={i} className="rounded-xl bg-surface-2 p-3.5 text-sm">
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="项目名" value={p.name} onChange={(v) => setProj(i, { name: v })} />
                  <Field label="角色" value={p.role ?? ""} onChange={(v) => setProj(i, { role: v })} />
                </div>
                <Area label="描述" value={p.description} onChange={(v) => setProj(i, { description: v })} />
                <Area
                  label="亮点（每行一条）"
                  value={(p.highlights ?? []).join("\n")}
                  onChange={(v) => setProj(i, { highlights: v.split("\n").filter(Boolean) })}
                />
                <button
                  className="mt-1 text-xs text-danger/70 transition hover:text-danger"
                  onClick={() => patch({ projects: content.projects.filter((_, j) => j !== i) })}
                >
                  删除
                </button>
              </div>
            ))}
            <button
              className="text-sm font-medium text-primary transition hover:text-primary-hover"
              onClick={() => patch({ projects: [...content.projects, { name: "", description: "", highlights: [] }] })}
            >
              + 添加项目
            </button>
          </Card>
        </div>

        {/* 右：样式工具栏 + 实时预览（打印时仅输出预览本体） */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3 text-sm print-hidden">
            <select
              className={selectCls}
              value={style.template}
              onChange={(e) => setStyle({ ...style, template: e.target.value as ResumeStyle["template"] })}
              title="模板"
            >
              {RESUME_TEMPLATE_LIST.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.description}
                </option>
              ))}
            </select>
            <select
              className={selectCls}
              value={style.font}
              onChange={(e) => setStyle({ ...style, font: e.target.value as ResumeStyle["font"] })}
              title="字体"
            >
              <option value="sans">无衬线</option>
              <option value="serif">衬线</option>
            </select>
            <input
              type="color"
              className="h-9 w-10 cursor-pointer rounded-[10px] border border-border-strong bg-surface"
              value={style.accentColor}
              onChange={(e) => setStyle({ ...style, accentColor: e.target.value })}
              title="主色"
            />
            <select
              className={selectCls}
              value={style.spacing}
              onChange={(e) => setStyle({ ...style, spacing: e.target.value as ResumeStyle["spacing"] })}
              title="间距"
            >
              <option value="compact">紧凑</option>
              <option value="normal">标准</option>
              <option value="relaxed">宽松</option>
            </select>
            <Button variant="soft" size="sm" onClick={saveStyle} disabled={busy !== ""}>
              保存样式
            </Button>
            <Button size="sm" onClick={() => window.print()} title="通过浏览器打印为 PDF（A4）">
              <Download size={14} strokeWidth={1.8} />
              导出 PDF
            </Button>
          </div>
          <div className="h-[calc(100vh-11rem)] overflow-auto rounded-2xl border border-border bg-surface-3 p-4 print:h-auto print:overflow-visible print:border-0 print:bg-white print:p-0">
            <div className="resume-zoom mx-auto w-fit shadow-lg print:shadow-none">
              <ResumePreview content={content} style={style} />
            </div>
          </div>
        </div>
      </div>
      {/* JD → 简历定制（V3.1 B5） */}
      {showTailor && (
        <Modal
          title="针对职位定制简历"
          onClose={() => {
            setShowTailor(false);
            window.history.replaceState({}, "", `/resumes/${id}`);
          }}
        >
          <div className="space-y-4 text-sm">
            <label className="block text-xs font-medium text-t3">
              目标职位
              <select
                className={`mt-1.5 w-full ${inputBase} h-10 px-3.5`}
                value={tailorJobId}
                onChange={(e) => setTailorJobId(e.target.value)}
              >
                <option value="">请选择…</option>
                {jobOptions.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} · {j.companyName}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={startTailor} disabled={tailorBusy} className="w-full" size="lg">
              <Target size={14} strokeWidth={1.8} />
              {tailorBusy ? "分析中…" : "开始定制分析"}
            </Button>
            {tailorError && <p className="text-danger">{tailorError}</p>}

            {tailor && (
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-[12.5px] font-semibold text-t1">关键词覆盖</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tailor.keywordCoverage.map((c) => (
                      <Badge key={c.keyword} tone={c.status === "matched" ? "success" : c.status === "partial" ? "warn" : "danger"}>
                        {c.keyword} {c.status === "matched" ? "✓" : c.status === "partial" ? "△" : "✕"}
                      </Badge>
                    ))}
                    {tailor.keywordCoverage.length === 0 && <span className="text-xs text-t3">该职位未解析出技能关键词</span>}
                  </div>
                </div>

                {tailor.gapAnalysis.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[12.5px] font-semibold text-t1">缺口分析（真实经历 &gt; 关键词，禁止虚构）</p>
                    <ul className="space-y-1.5 text-xs">
                      {tailor.gapAnalysis.map((g, i) => (
                        <li key={i} className="rounded-[10px] bg-surface-2 p-2.5">
                          <Badge
                            tone={g.category === "true_gap" ? "danger" : g.category === "adjacent_skill" ? "warn" : "primary"}
                            className="mr-1.5 h-5 px-2 text-[10.5px]"
                          >
                            {GAP_CATEGORY_LABEL[g.category]}
                          </Badge>
                          <span className="text-t2">{g.suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {tailor.reorderSuggestions.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[12.5px] font-semibold text-t1">排序建议</p>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-t2">
                      {tailor.reorderSuggestions.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {tailor.wordingSuggestions.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[12.5px] font-semibold text-t1">措辞建议（原文 → 依据 → 改写后，仅改写原文不新增事实）</p>
                    <div className="space-y-2">
                      {tailor.wordingSuggestions.map((s, i) => {
                        const st = tailorEditState[i];
                        return (
                          <div key={i} className="rounded-[10px] bg-surface-2 p-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge tone="primary" className="h-5 px-2 text-[10.5px]">
                                {s.section}
                              </Badge>
                              {s.evidence && (
                                <span
                                  title={`依据 JD 关键词「${s.evidence.keyword}」的覆盖状态：${s.evidence.status === "matched" ? "已命中" : "相近命中"}`}
                                >
                                  <Badge tone={s.evidence.status === "matched" ? "success" : "warn"} className="h-5 px-2 text-[10.5px]">
                                    依据：{s.evidence.keyword} {s.evidence.status === "matched" ? "✓" : "△"}
                                  </Badge>
                                </span>
                              )}
                            </div>
                            {s.before && (
                              <div className="mt-2 rounded-[10px] bg-surface p-2.5">
                                <p className="mb-1 text-[10.5px] font-medium text-t3">原文</p>
                                <DiffText before={s.before} after={st?.after ?? s.after} />
                              </div>
                            )}
                            {st?.decision === "accepted" ? (
                              <p className="mt-1 text-xs text-success">已应用：{st.after}</p>
                            ) : st?.decision === "rejected" ? (
                              <p className="mt-1 text-xs text-t3">已拒绝</p>
                            ) : (
                              <>
                                <div className="mt-2 rounded-[10px] border border-border bg-surface p-2.5">
                                  <p className="mb-1 text-[10.5px] font-medium text-t3">改写后（可直接编辑）</p>
                                  <textarea
                                    className="w-full bg-transparent text-xs text-t1 outline-none"
                                    rows={2}
                                    value={st?.after ?? s.after}
                                    onChange={(e) =>
                                      setTailorEditState((prev) => ({
                                        ...prev,
                                        [i]: { decision: "accepted", after: e.target.value },
                                      }))
                                    }
                                  />
                                </div>
                                <div className="mt-1.5 rounded-[10px] bg-primary-soft p-2.5">
                                  <p className="mb-0.5 text-[10.5px] font-medium text-t3">依据</p>
                                  <p className="text-xs text-t2">{s.reason}</p>
                                </div>
                                <div className="mt-1.5 flex gap-2">
                                  <Button
                                    variant="success"
                                    size="sm"
                                    onClick={() => {
                                      setTailorEditState((prev) => ({
                                        ...prev,
                                        [i]: { decision: "accepted", after: st?.after ?? s.after },
                                      }));
                                      applyTextEdit(s.before ? { ...s, after: st?.after ?? s.after } : { ...s, after: st?.after ?? s.after });
                                    }}
                                  >
                                    接受
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setTailorEditState((prev) => ({
                                        ...prev,
                                        [i]: { decision: "rejected", after: s.after },
                                      }))
                                    }
                                  >
                                    拒绝
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <p className="text-xs text-t3">
                  应用建议后记得点「保存为新版本」。AI 不会替你虚构任何经历——缺口只能靠学习或真实项目补上。
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-t3">{label}</span>
      <input className={`${inputBase} h-9 px-2.5`} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** V3.4 溯源对比：before→after 的字符级差异渲染（删除划线红、新增绿） */
function DiffText({ before, after }: { before: string; after: string }) {
  const segments: DiffSegment[] = diffChars(before, after);
  return (
    <p className="text-xs leading-relaxed text-t2">
      {segments.map((seg, i) =>
        seg.type === "same" ? (
          <span key={i}>{seg.text}</span>
        ) : seg.type === "del" ? (
          <span key={i} className="text-danger line-through">
            {seg.text}
          </span>
        ) : (
          <span key={i} className="font-medium text-success">
            {seg.text}
          </span>
        ),
      )}
    </p>
  );
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mt-1 block">
      <span className="mb-1 block text-xs font-medium text-t3">{label}</span>
      <textarea className={`${inputBase} px-2.5 py-1.5`} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
