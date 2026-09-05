import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "JobHunter — AI 求职操作系统",
  description: "简历工作台 · 职位匹配 · 投递进度管理",
};

// 首屏防闪烁：渲染前根据 localStorage 恢复主题（默认浅色）
const themeScript = `try{if(localStorage.getItem("jh-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-bg font-sans text-t1 antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
