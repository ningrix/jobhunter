"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("jh-theme", next ? "dark" : "light");
    } catch {
      /* 隐私模式等场景忽略 */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="切换深浅主题"
      title={dark ? "切换到浅色" : "切换到深色"}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-t3 transition hover:bg-surface-2 hover:text-t1 ${className}`}
    >
      {dark ? <Sun size={16} strokeWidth={1.7} /> : <Moon size={16} strokeWidth={1.7} />}
    </button>
  );
}
