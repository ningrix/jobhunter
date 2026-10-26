"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, FileText, LayoutDashboard, Menu, Plug, Settings, Sparkles, Target, X } from "lucide-react";
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
      { href: "/company-sources", label: "官方招聘导航", icon: Building2 },
    ],
  },
  {
    label: "系统",
    items: [{ href: "/settings", label: "设置", icon: Settings }],
  },
] as const;

/** 侧栏主体：桌面常驻侧栏与移动端抽屉共用同一份内容 */
function SidebarBody({
  name,
  email,
  onClose,
  showLogout = true,
}: {
  name: string;
  email: string;
  onClose?: () => void;
  showLogout?: boolean;
}) {
  const pathname = usePathname();

  return (
    <>
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-gradient-brand text-white">
          <Target size={20} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-tight text-t1">JobHunter</p>
          <p className="text-[11px] tracking-[0.1em] text-t3">本地引擎（演示模式）</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="关闭导航菜单"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-border-strong bg-surface text-t2 transition hover:text-t1"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        )}
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
                    onClick={onClose}
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
          <p className="text-[11.5px] font-semibold text-t2">智能能力</p>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-t3">本地引擎演示：简历解析 · JD 结构化 · 智能匹配 · 诊断优化</p>
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
        {showLogout && <LogoutButton />}
      </div>
    </>
  );
}

export function AppSidebar({
  name,
  email,
  showLogout = true,
}: {
  name: string;
  email: string;
  showLogout?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // 路由变化即收起抽屉（导航后抽屉不能挡住新页面）
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 抽屉打开时锁定 body 滚动
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Esc 关闭抽屉
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* 桌面常驻侧栏（md 及以上） */}
      <aside className="sticky top-0 z-20 hidden h-screen w-[232px] shrink-0 flex-col border-r border-border bg-surface md:flex">
        <SidebarBody name={name} email={email} showLogout={showLogout} />
      </aside>

      {/* 移动端顶栏（md 以下）：汉堡入口 */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-4 print-hidden md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-gradient-brand text-white">
            <Target size={17} strokeWidth={2} />
          </div>
          <p className="text-[15px] font-bold text-t1">JobHunter</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="打开导航菜单"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border-strong bg-surface text-t2 transition hover:text-t1"
        >
          <Menu size={18} strokeWidth={1.8} />
        </button>
      </header>

      {/* 移动端抽屉 */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="导航菜单">
          <div className="absolute inset-0 bg-scrim" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex h-full w-[272px] max-w-[85vw] flex-col border-r border-border bg-surface">
            <SidebarBody name={name} email={email} onClose={() => setOpen(false)} showLogout={showLogout} />
          </aside>
        </div>
      )}
    </>
  );
}
