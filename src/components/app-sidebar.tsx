"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Briefcase, Compass, FileText, LayoutDashboard, Plug, Settings, Sparkles, Target } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogoutButton } from "@/app/(app)/logout-button";

const GROUPS = [
  {
    label: "总览",
    items: [{ href: "/dashboard", label: "仪表盘", icon: LayoutDashboard }],
  },
  {
    label: "求职准备",
    items: [
      { href: "/resumes", label: "简历工作台", icon: FileText },
      { href: "/jobs", label: "职位中心", icon: Target },
      { href: "/job-sources", label: "职位来源", icon: Plug },
    ],
  },
  {
    label: "投递跟进",
    items: [
      { href: "/applications", label: "投递看板", icon: Briefcase },
      { href: "/reminders", label: "提醒", icon: Bell },
      { href: "/discovery", label: "职位发现", icon: Compass },
    ],
  },
  {
    label: "系统",
    items: [{ href: "/settings", label: "设置", icon: Settings }],
  },
] as const;

export function AppSidebar({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 z-20 flex h-screen w-[232px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-gradient-brand text-white">
          <Target size={20} strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-[17px] font-bold leading-tight text-t1">JobHunter</p>
          <p className="text-[11px] tracking-[0.1em] text-t3">AI 求职操作系统</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold tracking-[0.2em] text-t3">{group.label}</p>
            <div className="space-y-1.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-[13.5px] transition-colors ${
                      active
                        ? "bg-primary-soft font-semibold text-primary"
                        : "font-medium text-t2 hover:bg-primary-soft/50 hover:text-t1"
                    }`}
                  >
                    {active && (
                      <span className="absolute -left-px top-1/2 h-6 w-[3.5px] -translate-y-1/2 rounded-full bg-gradient-brand" />
                    )}
                    <Icon size={19} strokeWidth={active ? 1.9 : 1.7} className={active ? "text-primary" : "text-t3"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mx-4 mb-4 rounded-[14px] bg-surface-2 p-3.5">
        <div className="flex items-center gap-2">
          <Sparkles size={16} strokeWidth={1.7} className="text-primary" />
          <p className="text-[11.5px] font-semibold text-t2">AI 能力</p>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-t3">简历解析 · JD 结构化 · 智能匹配 · 诊断优化</p>
      </div>

      <div className="flex items-center gap-2.5 border-t border-border p-4">
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-gradient-brand text-sm font-bold text-white">
          {(name || "U").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-t1">{name}</p>
          <p className="truncate text-[10.5px] text-t3">{email}</p>
        </div>
        <ThemeToggle />
        <LogoutButton />
      </div>
    </aside>
  );
}
