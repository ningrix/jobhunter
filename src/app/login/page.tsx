"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Target } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        await api("/auth/register", { method: "POST", body: { email, password, name } });
      } else {
        await api("/auth/login", { method: "POST", body: { email, password } });
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

  function fillDemo() {
    setMode("login");
    setEmail("demo@jobhunter.cn");
    setPassword("demo12345");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="glow-a absolute -right-16 top-1/4 h-[300px] w-[300px] rounded-full" />
        <div className="glow-b absolute -left-10 bottom-0 h-[360px] w-[360px] rounded-full" />
      </div>

      <div className="relative z-10 flex w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {/* 左侧品牌面板 */}
        <div className="relative hidden w-[42%] flex-col justify-between bg-gradient-to-br from-[#4338ca] via-[#5b4fe8] to-[#7c3aed] p-8 text-white lg:flex">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-white/15 backdrop-blur-sm">
                <Target size={20} strokeWidth={2} />
              </div>
              <div>
                <p className="text-[17px] font-bold leading-tight">JobHunter</p>
                <p className="text-[10.5px] tracking-[0.15em] text-white/70">AI 求职操作系统</p>
              </div>
            </div>
            <p className="mt-8 text-xl font-bold leading-snug">
              简历工作台 × 职位智能匹配
              <br />
              × 投递进度管理
            </p>
          </div>
          <ul className="space-y-2.5 text-[12.5px] text-white/85">
            <li className="flex items-center gap-2">
              <Sparkles size={14} strokeWidth={1.8} /> AI 解析简历与 JD，一键结构化
            </li>
            <li className="flex items-center gap-2">
              <Sparkles size={14} strokeWidth={1.8} /> 规则评分 + AI 解读的智能匹配
            </li>
            <li className="flex items-center gap-2">
              <Sparkles size={14} strokeWidth={1.8} /> 想投 → Offer 全流程投递看板
            </li>
          </ul>
        </div>

        {/* 右侧表单 */}
        <div className="flex-1 p-8">
          <div className="mb-6 lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-gradient-brand text-white">
                <Target size={20} strokeWidth={2} />
              </div>
              <p className="text-[17px] font-bold text-t1">JobHunter</p>
            </div>
          </div>

          <h1 className="text-lg font-bold text-t1">{mode === "login" ? "欢迎回来" : "创建账号"}</h1>
          <p className="mt-1 text-[12.5px] text-t3">
            {mode === "login" ? "登录你的求职工作台" : "注册后立即开始管理求职进度"}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-1.5 rounded-[11px] bg-surface-2 p-1 text-sm">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-[9px] py-2 font-semibold transition ${
                  mode === m ? "bg-surface text-primary shadow-card" : "text-t2 hover:text-t1"
                }`}
              >
                {m === "login" ? "登录" : "注册"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === "register" && (
              <Field label="姓名">
                <Input placeholder="你的名字" value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
            )}
            <Field label="邮箱">
              <Input placeholder="you@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="密码" hint={mode === "register" ? "至少 8 位" : undefined}>
              <Input
                placeholder="••••••••"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && (
              <p className="rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
            </Button>
          </form>

          <button
            type="button"
            onClick={fillDemo}
            className="mt-4 w-full text-center text-xs text-t3 transition hover:text-primary"
          >
            使用演示账号：demo@jobhunter.cn / demo12345
          </button>
        </div>
      </div>
    </main>
  );
}
