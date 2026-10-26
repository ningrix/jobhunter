"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  GraduationCap,
  LayoutGrid,
  Search,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { api } from "@/lib/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Loading } from "@/components/ui/spinner";
import { inputBase } from "@/components/ui/field";

interface CompanySource {
  id: string;
  name: string;
  url: string;
  campusUrl?: string;
  category: string;
  note?: string;
  verified: boolean;
}

interface Payload {
  categories: string[];
  total: number;
  verifiedCount: number;
  items: CompanySource[];
}

/** 名称首字 monogram（中文取首字，字母名取首字母大写） */
function monogram(name: string): string {
  return (name || "?").slice(0, 1).toUpperCase();
}

/** 企业官方招聘导航目录：嵌入职位来源页使用（数据来自 /api/v1/company-sources） */
export function CompanyCatalog() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<string>("全部");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    api<Payload>("/company-sources")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const items = useMemo(() => {
    if (!data) return [];
    const kw = keyword.trim().toLowerCase();
    return data.items.filter(
      (c) =>
        (category === "全部" || c.category === category) &&
        (!kw || c.name.toLowerCase().includes(kw) || (c.note ?? "").toLowerCase().includes(kw)),
    );
  }, [data, category, keyword]);

  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of data?.items ?? []) map.set(c.category, (map.get(c.category) ?? 0) + 1);
    return map;
  }, [data]);

  if (error) {
    return <p className="rounded-[10px] border border-danger-border bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>;
  }

  if (!data) return <Loading />;

  return (
    <div className="space-y-4">
      {/* 统计条（dashboard KPI 卡同语言，紧凑单行版；窄屏降级单列） */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-4 sm:px-5">
        {[
          { icon: Building2, label: "收录企业", value: data.total, tile: "bg-primary-soft text-primary" },
          { icon: BadgeCheck, label: "已验证", value: data.verifiedCount, tile: "bg-success-soft text-success" },
          { icon: LayoutGrid, label: "覆盖分类", value: data.categories.length, tile: "bg-primary-soft text-primary" },
          {
            icon: GraduationCap,
            label: "校招直连",
            value: data.items.filter((c) => c.campusUrl).length,
            tile: "bg-primary-soft text-primary",
          },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <div className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${s.tile}`}>
              <s.icon size={17} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <p className="whitespace-nowrap text-[12.5px] font-medium text-t2">{s.label}</p>
              <p className="whitespace-nowrap text-[20px] font-bold leading-tight text-t1">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 搜索 + 分类 pill（discovery 同款圆角筛选） */}
      <div className="flex flex-wrap items-center gap-2 print-hidden">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-t3" />
          <input
            className={`${inputBase} h-9 w-60 rounded-full pl-9 pr-3`}
            placeholder="搜索公司…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        {["全部", ...data.categories].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`h-9 rounded-full px-4 text-[13px] font-semibold transition ${
              category === c
                ? "bg-gradient-brand text-on-primary"
                : "border border-border-strong bg-surface text-t2 hover:text-t1"
            }`}
          >
            {c}
            <span className="ml-1.5 text-[11px] font-medium opacity-60">
              {c === "全部" ? data.total : (countByCategory.get(c) ?? 0)}
            </span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Search} title="没有匹配的企业" hint="换个关键词或分类试试" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <Card key={c.id} className="flex flex-col gap-2.5 p-4 transition-colors hover:border-primary-soft-border">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-[15px] font-bold text-primary">
                    {monogram(c.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-t1">{c.name}</p>
                    <span className="mt-0.5 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-t2">
                      {c.category}
                    </span>
                  </div>
                </div>
                {c.verified ? (
                  <span title="官方域名已核对且探活可达（2026-10-05）">
                    <Badge tone="success" className="h-5 shrink-0 px-2 text-[10.5px]">
                      <BadgeCheck size={12} /> 已验证
                    </Badge>
                  </span>
                ) : (
                  <span title="该入口域名尚未人工核对，跳转后请自行确认">
                    <Badge tone="warn" className="h-5 shrink-0 px-2 text-[10.5px]">
                      <ShieldQuestion size={12} /> 待验证
                    </Badge>
                  </span>
                )}
              </div>
              {c.note && <p className="text-xs leading-relaxed text-t3">{c.note}</p>}
              <div className="mt-auto flex gap-2 border-t border-border pt-3">
                <a href={c.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                  <Button variant="soft" size="sm" className="w-full">
                    招聘官网 <ArrowUpRight size={13} />
                  </Button>
                </a>
                {c.campusUrl && (
                  <a href={c.campusUrl} target="_blank" rel="noreferrer">
                    <Button variant="primary" size="sm">
                      <GraduationCap size={13} /> 校招入口
                    </Button>
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2.5 rounded-xl bg-surface-2 px-4 py-3 text-xs leading-relaxed text-t3">
        <ShieldCheck size={15} strokeWidth={1.7} className="mt-0.5 shrink-0 text-t2" />
        <p>
          本板块只做官方入口导航：不代登录、不代投递、不保存你在这些网站上的任何账号信息。发现失效入口欢迎反馈修正。
        </p>
      </div>
    </div>
  );
}
