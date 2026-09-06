"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Upload } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ResumeRow {
  id: string;
  title: string;
  isPrimary: boolean;
  updatedAt: string;
}

interface FileInfo {
  fileName: string;
  filePath: string;
  fileId: string;
  parseStatus: "pending" | "done" | "failed";
  parseError: string | null;
}

const PARSE_BADGE: Record<FileInfo["parseStatus"], { label: string; tone: "success" | "warn" | "danger" }> = {
  done: { label: "已解析", tone: "success" },
  pending: { label: "解析中", tone: "warn" },
  failed: { label: "解析失败", tone: "danger" },
};

export default function ResumesPage() {
  const [list, setList] = useState<ResumeRow[]>([]);
  const [fileInfos, setFileInfos] = useState<Record<string, FileInfo>>({});
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ResumeRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const [rows, infos] = await Promise.all([
        api<ResumeRow[]>("/resumes"),
        api<Record<string, FileInfo>>("/resumes/file-infos").catch(() => ({})),
      ]);
      setList(rows);
      setFileInfos(infos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    if (!title.trim()) return;
    setBusy("create");
    try {
      await api("/resumes", { method: "POST", body: { title } });
      setTitle("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy("");
    }
  }

  async function upload(file: File) {
    setBusy("upload");
    setError("");
    try {
      // Stage B：文件先保存，解析尽力而为（失败不丢文件），上传即返回不阻塞等待
      await api<{ resumeId: string; taskId: string | null; parsed: boolean }>("/resumes/upload", {
        method: "POST",
        body: fd(file),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function fd(file: File): FormData {
    const fd = new FormData();
    fd.append("file", file);
    return fd;
  }

  async function setPrimary(id: string) {
    await api(`/resumes/${id}`, { method: "PATCH", body: { isPrimary: true } });
    await load();
  }

  async function remove(id: string) {
    await api(`/resumes/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-5">
      <PageHeader title="简历工作台" desc="上传 PDF / Word(docx) / txt / md 即保存（保留本地文件，可随时打开原文件）；AI 解析尽力而为，失败可一键重试" />

      <Card className="flex flex-wrap items-center gap-2 p-4">
        <Input
          className="max-w-xs"
          placeholder="新简历名称，如「前端主简历」"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button onClick={create} disabled={busy === "create"}>
          新建空白简历
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.pdf,.docx"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <Button variant="soft" onClick={() => fileRef.current?.click()} disabled={busy === "upload"}>
          <Upload size={14} strokeWidth={1.8} />
          {busy === "upload" ? "保存中…" : "上传简历文件（pdf / docx / txt / md）"}
        </Button>
        {error && (
          <p className="w-full rounded-[10px] border border-danger-border bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => {
          const info = fileInfos[r.id];
          return (
          <Card key={r.id} className="p-5 transition-colors hover:border-primary-soft-border">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/resumes/${r.id}`} className="truncate text-[13.5px] font-semibold text-t1 hover:text-primary">
                {r.title}
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                {r.isPrimary && <Badge tone="warn">主简历</Badge>}
                {info && (
                  <Badge tone={PARSE_BADGE[info.parseStatus].tone}>
                    {PARSE_BADGE[info.parseStatus].label}
                  </Badge>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-t3">更新于 {new Date(r.updatedAt).toLocaleString("zh-CN")}</p>
            {info && (
              <p
                className="mt-1 truncate text-[11px] text-t3"
                title={info.parseStatus === "failed" ? info.parseError ?? "" : info.filePath}
              >
                {info.fileName} ·{" "}
                {info.parseStatus === "failed"
                  ? info.parseError
                  : `本地 ${info.filePath}`}{" "}
                <a
                  href={`/api/v1/files/${info.fileId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  打开原文件 ↗
                </a>
              </p>
            )}
            <div className="mt-3.5 flex flex-wrap gap-2">
              <Link
                href={`/resumes/${r.id}`}
                className="inline-flex h-8 items-center rounded-[10px] border border-primary-soft-border bg-primary-soft px-3 text-xs font-semibold text-primary transition hover:bg-primary-soft/70"
              >
                编辑 / AI 优化
              </Link>
              {!r.isPrimary && (
                <button
                  onClick={() => setPrimary(r.id)}
                  className="inline-flex h-8 items-center rounded-[10px] border border-border-strong bg-surface px-3 text-xs font-semibold text-t2 transition hover:text-t1"
                >
                  设为主简历
                </button>
              )}
              <button
                onClick={() => setPendingDelete(r)}
                className="inline-flex h-8 items-center rounded-[10px] border border-border-strong bg-surface px-3 text-xs font-semibold text-t2 transition hover:border-danger-border hover:bg-danger-soft hover:text-danger"
              >
                删除
              </button>
            </div>
          </Card>
          );
        })}
        {list.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <EmptyState icon={FileText} title="还没有简历" hint="先新建一份空白简历，或上传文件让 AI 解析" />
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除简历"
        message={`确认删除「${pendingDelete?.title ?? ""}」？该操作不可恢复。`}
        confirmText="删除"
        danger
        onConfirm={() => pendingDelete && remove(pendingDelete.id)}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
