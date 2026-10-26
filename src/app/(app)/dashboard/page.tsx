"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, FileText, Target } from "lucide-react";
import { api } from "@/lib/client";
import { Card, CardTitle } from "@/components/ui/card";
import { Loading } from "@/components/ui/spinner";
import { PageHeader } from "@/components/ui/page-header";

interface Overview {
  resumeCount: number;
  jobCount: number;
}

const QUICK_LINKS = [
  { href: "/resumes", label: "简历工作台", desc: "上传/编辑简历，五套模板 + PDF 导出", icon: FileText },
  { href: "/jobs", label: "职位中心", desc: "雷达一键扫描入库 · 粘贴 JD 建档 · 智能匹配 · 导出 Excel", icon: Target },
  { href: "/company-sources", label: "官方招聘导航", desc: "140 家企业/平台官方招聘入口直达", icon: Building2 },
];

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Overview>("/dashboard/overview")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <Card className="border-danger-border bg-danger-soft p-5 text-sm text-danger">{error}</Card>;
  }
  if (!data) return <Loading />;

  const stats = [
    { label: "简历", value: data.resumeCount, href: "/resumes", icon: FileText },
    { label: "职位", value: data.jobCount, href: "/jobs", icon: Target },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="仪表盘" desc="求职全景：简历与职位总览" />

      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary-soft-border"
            >
              <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                <Icon size={18} strokeWidth={1.7} />
              </div>
              <p className="mt-3 text-[12.5px] font-medium text-t2">{s.label}</p>
              <p className="text-[28px] font-bold leading-tight text-t1">{s.value}</p>
            </Link>
          );
        })}
      </div>

      <Card className="p-6">
        <CardTitle>快捷入口</CardTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {QUICK_LINKS.map((q) => {
            const Icon = q.icon;
            return (
              <Link
                key={q.href}
                href={q.href}
                className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary-soft-border"
              >
                <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                  <Icon size={17} strokeWidth={1.7} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-t1">{q.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-t3">{q.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
