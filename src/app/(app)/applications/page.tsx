"use client";

import { useEffect, useState } from "react";
import { Clock, FileText } from "lucide-react";
import { api } from "@/lib/client";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { StageDot, STAGE_LABELS } from "@/components/ui/stage";
import { useToast } from "@/components/ui/toast";
import { Loading } from "@/components/ui/spinner";
import { PageHeader } from "@/components/ui/page-header";
import type { ApplicationStage } from "@/shared/types";

interface JobInfo {
  id: string;
  title: string;
  companyName: string;
  city: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
}

interface BoardItem {
  id: string;
  stage: string;
  job: JobInfo;
  resumeTitle: string | null;
  notes: string | null;
  nextActionAt: string | null;
}

interface BoardColumn {
  stage: ApplicationStage;
  label: string;
  items: BoardItem[];
}

interface DetailData {
  application: { id: string; stage: string; notes: string | null; appliedAt: string | null };
  job: JobInfo;
  events: { id: string; type: string; fromStage: string | null; toStage: string | null; note: string | null; occurredAt: string }[];
}

const ALLOWED: Record<string, ApplicationStage[]> = {
  wishlist: ["applied", "closed"],
  applied: ["written_test", "interview", "rejected", "closed"],
  written_test: ["interview", "rejected", "closed"],
  interview: ["offer", "rejected", "closed"],
  offer: ["closed", "rejected"],
  rejected: ["closed"],
  closed: [],
};

export default function ApplicationsPage() {
  const toast = useToast();
  const [board, setBoard] = useState<BoardColumn[]>([]);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [note, setNote] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setBoard(await api<BoardColumn[]>("/applications/board"));
  }
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function openDetail(id: string) {
    setDetail(await api<DetailData>(`/applications/${id}`));
  }

  async function move(item: BoardItem, toStage: ApplicationStage) {
    try {
      await api(`/applications/${item.id}/stage`, { method: "POST", body: { toStage } });
      await load();
      if (detail?.application.id === item.id) await openDetail(item.id);
      toast(`已流转到「${STAGE_LABELS[toStage]}」`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "流转失败", "error");
    }
  }

  async function addNote() {
    if (!note.trim() || !detail) return;
    await api(`/applications/${detail.application.id}/events`, {
      method: "POST",
      body: { note },
    });
    setNote("");
    await openDetail(detail.application.id);
    await load();
    toast("跟进备注已添加");
  }

  async function addReminder() {
    if (!reminderTitle.trim() || !reminderAt || !detail) return;
    await api("/reminders", {
      method: "POST",
      body: { title: reminderTitle, remindAt: new Date(reminderAt).toISOString(), applicationId: detail.application.id },
    });
    setReminderTitle("");
    setReminderAt("");
    setMsg("提醒已创建 ✅");
    toast("提醒已创建");
  }

  const currentStage = detail ? ALLOWED[detail.application.stage] ?? [] : [];

  return (
    <div className="space-y-4">
      <PageHeader title="投递看板" desc="想投 → 已投递 → 笔试 → 面试 → Offer，全流程流转" />
      {msg && <p className="text-sm text-success">{msg}</p>}

      <div className="flex gap-3.5 pb-2">
        {board.map((col) => (
          <div key={col.stage} className="w-64 shrink-0 rounded-[14px] bg-surface-2 p-2.5">
            <div className="mb-2.5 flex items-center justify-between px-1.5 pt-1">
              <span className="flex items-center gap-2 text-[12.5px] font-bold text-t2">
                <StageDot stage={col.stage} />
                {col.label}
              </span>
              <span className="rounded-full border border-border bg-surface px-2 text-[11px] text-t2">{col.items.length}</span>
            </div>
            <div className="space-y-2.5">
              {col.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openDetail(item.id)}
                  className="w-full rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-primary-soft-border"
                >
                  <p className="text-[12.5px] font-semibold text-t1">{item.job.title}</p>
                  <p className="mt-0.5 flex items-center justify-between gap-2 text-[11.5px] text-t2">
                    <span className="truncate">{item.job.companyName}</span>
                    {item.job.salaryMin ? (
                      <span className="shrink-0 text-[10.5px] font-semibold text-success">
                        {item.job.salaryMin}-{item.job.salaryMax}K
                      </span>
                    ) : null}
                  </p>
                  {item.resumeTitle && (
                    <p className="mt-1.5 inline-flex items-center gap-1 rounded-[9px] bg-primary-soft px-1.5 py-0.5 text-[11px] text-primary">
                      <FileText size={11} strokeWidth={1.6} />
                      {item.resumeTitle}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
        {board.length === 0 && !msg && <Loading text="看板加载中…" />}
      </div>

      {detail && (
        <Modal onClose={() => setDetail(null)} title={`${detail.job.title} · ${detail.job.companyName}`} size="lg">
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-soft-border bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                <StageDot stage={detail.application.stage} />
                当前：{STAGE_LABELS[detail.application.stage] ?? detail.application.stage}
              </span>
              {currentStage
                .filter((s) => s !== "closed")
                .map((s) => (
                  <button
                    key={s}
                    onClick={() => move(detail.application as unknown as BoardItem, s).then(() => undefined)}
                    className="rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-medium text-t2 transition hover:border-primary hover:text-primary"
                  >
                    → {STAGE_LABELS[s]}
                  </button>
                ))}
            </div>

            <div>
              <p className="mb-2 text-[12.5px] font-semibold text-t1">时间线</p>
              <ol className="space-y-2.5 border-l-2 border-primary-soft-border pl-4">
                {detail.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span
                      className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface"
                      style={{ background: "var(--primary)" }}
                    />
                    <p className="text-xs text-t3">
                      {new Date(e.occurredAt).toLocaleString("zh-CN")} ·{" "}
                      {e.type === "stage_change"
                        ? `${STAGE_LABELS[e.fromStage ?? ""] ?? ""} → ${STAGE_LABELS[e.toStage ?? ""]}`
                        : e.type === "note"
                          ? "备注"
                          : "创建"}
                    </p>
                    {e.note && <p className="text-t2">{e.note}</p>}
                  </li>
                ))}
              </ol>
              <div className="mt-2.5 flex gap-2">
                <Input
                  placeholder="添加跟进备注…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addNote()}
                />
                <Button onClick={addNote}>添加</Button>
              </div>
            </div>

            <div className="rounded-xl bg-surface-2 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-t1">
                <Clock size={14} strokeWidth={1.7} className="text-warn" />
                为此投递设提醒
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-[160px] flex-1"
                  placeholder="提醒标题，如：准备二面"
                  value={reminderTitle}
                  onChange={(e) => setReminderTitle(e.target.value)}
                />
                <Input
                  type="datetime-local"
                  className="w-auto"
                  value={reminderAt}
                  onChange={(e) => setReminderAt(e.target.value)}
                />
                <Button onClick={addReminder}>创建</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
