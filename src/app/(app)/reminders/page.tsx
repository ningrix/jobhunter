"use client";

import { useEffect, useState } from "react";
import { BellOff, Check } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

interface ReminderRow {
  id: string;
  title: string;
  content: string | null;
  remindAt: string;
  status: string;
  applicationId: string | null;
}

const TABS = { pending: "待办", done: "已完成", ignored: "已忽略", all: "全部" } as const;

export default function RemindersPage() {
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [tab, setTab] = useState<keyof typeof TABS>("pending");
  const [title, setTitle] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [error, setError] = useState("");

  async function load(t = tab) {
    setRows(await api<ReminderRow[]>(`/reminders?status=${t}`));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function create() {
    if (!title.trim() || !remindAt) {
      setError("标题与时间为必填");
      return;
    }
    setError("");
    await api("/reminders", {
      method: "POST",
      body: { title, remindAt: new Date(remindAt).toISOString() },
    });
    setTitle("");
    setRemindAt("");
    await load();
  }

  async function finish(id: string, status: "done" | "ignored") {
    await api(`/reminders/${id}`, { method: "PATCH", body: { status } });
    await load();
  }

  const isDue = (r: ReminderRow) => r.status === "pending" && new Date(r.remindAt).getTime() <= Date.now();

  return (
    <div className="space-y-5">
      <PageHeader title="提醒" desc="跟进 HR、准备笔试，别让机会溜走" />

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label="新提醒标题" className="w-56">
          <Input placeholder="如：跟进 HR / 准备笔试" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="提醒时间">
          <Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
        </Field>
        <Button onClick={create}>创建提醒</Button>
        {error && (
          <p className="w-full rounded-[10px] border border-danger-border bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
              tab === t
                ? "bg-gradient-brand text-on-primary"
                : "border border-border-strong bg-surface text-t2 hover:text-t1"
            }`}
          >
            {TABS[t]}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {rows.map((r) => (
          <Card
            key={r.id}
            className={`flex items-center justify-between gap-3 p-4 ${
              isDue(r) ? "border-danger-border" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-t1">
                {r.title}
                {isDue(r) && <Badge tone="danger">已到期</Badge>}
              </p>
              {r.content && <p className="mt-0.5 text-xs text-t2">{r.content}</p>}
              <p className="mt-0.5 text-xs text-t3">{new Date(r.remindAt).toLocaleString("zh-CN")}</p>
            </div>
            {r.status === "pending" && (
              <div className="flex shrink-0 gap-2">
                <Button variant="success" size="sm" onClick={() => finish(r.id, "done")}>
                  <Check size={13} strokeWidth={2} />
                  完成
                </Button>
                <Button variant="ghost" size="sm" onClick={() => finish(r.id, "ignored")}>
                  忽略
                </Button>
              </div>
            )}
          </Card>
        ))}
        {rows.length === 0 && (
          <Card>
            <EmptyState icon={BellOff} title="这里空空如也" hint="创建一个提醒，到点站内通知你" />
          </Card>
        )}
      </div>
    </div>
  );
}
