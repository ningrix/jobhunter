import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { isLocalSingleUserMode } from "@/lib/auth-mode";
import { AppSidebar } from "@/components/app-sidebar";
import { AmbientGlow } from "@/components/ambient-glow";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      {/* 本地单用户模式（dev 免登录）下不渲染「退出登录」 */}
      <AppSidebar name={user.name} email={user.email} showLogout={!isLocalSingleUserMode()} />
      {/* 移动端 pt-[72px] 给固定顶栏（h-14）让位；桌面恢复 p-8 */}
      <main className="relative flex-1 overflow-x-auto p-4 pt-[72px] md:p-8">
        <AmbientGlow />
        <div className="relative z-10">{children}</div>
      </main>
    </div>
  );
}
