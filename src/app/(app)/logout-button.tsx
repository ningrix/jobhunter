"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { api } from "@/lib/client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="退出登录"
      title="退出登录"
      onClick={async () => {
        await api("/auth/logout", { method: "POST" }).catch(() => undefined);
        router.push("/login");
        router.refresh();
      }}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-t3 transition hover:bg-surface-2 hover:text-danger"
    >
      <LogOut size={16} strokeWidth={1.7} />
    </button>
  );
}
