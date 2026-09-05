"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Briefcase, FileText, PartyPopper, Target } from "lucide-react";
import { api } from "@/lib/client";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Loading } from "@/components/ui/spinner";
import { PageHeader } from "@/components/ui/page-header";
import { StageFunnelRows, TrendAreaChart, DonutChart } from "@/components/charts";
import { STAGE_ORDER, STAGE_LABELS, stageColorVar } from "@/components/ui/stage";
import { Badge } from "@/components/ui/badge";

interface Overview {
  resumeCount: number;
  jobCount: number;
  applicationTotal: number;
  stageCounts: Record<string, number>;
  funnel: { stage: string; label: string; count: number }[];
  weekly: { weekStart: string; count: number }[];
  dueReminderCount: number;
  upcomingReminderCount: number;
  agentFunnel: {
    discovered: number;
    policyPassed: number;
    recommended: number;
    userConfirmed: number;
    applied: number;
    interviewing: number;
    offers: number;
  };
}

interface ReminderRow {
  id: string;
  title: string;
  remindAt: string;
  status: string;
}

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [due, setDue] = useState<ReminderRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<Overview>("/dashboard/overview"), api<ReminderRow[]>("/reminders?due=1")])
      .then(([o, d]) => {
        setData(o);
        setDue(d);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <Card className="border-danger-border bg-danger-soft p-5 text-sm text-danger">{error}</Card>
    );
  }
  if (!data) return <Loading />;

  const af = data.agentFunnel ?? {
    discovered: 0,
    policyPassed: 0,
    recommended: 0,
    userConfirmed: 0,
    applied: 0,
    interviewing: 0,
    offers: 0,
  };
  const agentSteps = [
    { label: "发现岗位", value: af.discovered },
    { label: "符合条件", value: af.policyPassed },
    { label: "推荐", value: af.recommended },
    { label: "用户确认", value: af.userConfirmed },
    { label: "成功投递", value: af.applied },
    { label: "面试", value: af.interviewing },
    { label: "Offer", value: af.offers },
  ];

  const donutData = STAGE_ORDER.filter((s) => (data.stageCounts[s] ?? 0) > 0).map((s) => ({
    label: STAGE_LABELS[s],
    value: data.stageCounts[s] ?? 0,
    colorVar: stageColorVar(s),
  }));

  const stats = [
    { label: "简历", value: data.resumeCount, href: "/resumes", icon: FileText, danger: false },
    { label: "职位", value: data.jobCount, href: "/jobs", icon: Target, danger: false },
    { label: "投递总数", value: data.applicationTotal, href: "/applications", icon: Briefcase, danger: false },
    {
      label: "待办提醒",
      // overview 口径：upcoming 不含已到期项，卡片展示待办总数（到期+未到期），逾期徽章单独提示
      value: data.upcomingReminderCount + (data.dueReminderCount > 0 ? data.dueReminderCount : 0),
      href: "/reminders",
      icon: Bell,
      danger: data.dueReminderCount > 0,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="仪表盘" desc="求职全景：投递漏斗、趋势与到期待办" />

      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary-soft-border"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                  <Icon size={18} strokeWidth={1.7} />
                </div>
                {s.danger && <Badge tone="danger">逾期 {data.dueReminderCount}</Badge>}
              </div>
              <p className="mt-3 text-[12.5px] font-medium text-t2">{s.label}</p>
              <p className={`text-[28px] font-bold leading-tight ${s.danger ? "text-danger" : "text-t1"}`}>{s.value}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <CardTitle right={<Badge tone="primary">Agent</Badge>}>Agent 投递漏斗</CardTitle>
          <p className="mb-3 text-xs text-t3">发现（导入/来源访问）→ 符合策略 → 匹配推荐（≥70 分）→ 用户确认 → 投递 → 面试 → Offer</p>
          <FunnelGradientRows steps={agentSteps} />
        </Card>

        <Card className="p-6">
          <CardTitle>投递漏斗</CardTitle>
          <div className="pt-1">
            <StageFunnelRows rows={data.funnel.map((f) => ({ stage: f.stage, label: f.label, count: f.count }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <CardTitle>近 8 周投递趋势</CardTitle>
          <TrendAreaChart
            points={data.weekly.map((w) => ({ label: w.weekStart.slice(5), value: w.count }))}
          />
        </Card>

        <Card className="p-6">
          <CardTitle right={data.dueReminderCount > 0 ? <Badge tone="danger">{data.dueReminderCount} 到期</Badge> : undefined}>
            已到期待办
          </CardTitle>
          {due.length === 0 ? (
            <EmptyState icon={PartyPopper} title="暂无到期提醒" hint="所有待办都在掌控之中" />
          ) : (
            <ul className="space-y-2 text-sm">
              {due.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-xl border border-danger-border bg-danger-soft px-3.5 py-2.5"
                >
                  <span className="font-medium text-t1">{r.title}</span>
                  <span className="text-xs text-danger">
                    {new Date(r.remindAt).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mb-3 mt-5 text-[12.5px] font-semibold text-t2">各阶段分布</h3>
          <DonutChart data={donutData} />
        </Card>
      </div>
    </div>
  );
}

function FunnelGradientRows({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="space-y-2.5">
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-3 text-sm">
          <span className="w-16 shrink-0 text-[12.5px] text-t2">{s.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full min-w-0.5 rounded-full bg-gradient-bar"
              style={{ width: `${Math.max((s.value / max) * 100, 1)}%` }}
              title={`${s.value}`}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-[12.5px] font-semibold text-t1">{s.value}</span>
        </div>
      ))}
    </div>
  );
}
