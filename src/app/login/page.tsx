import { redirect } from "next/navigation";
import { isLocalSingleUserMode } from "@/lib/auth-mode";
import { LoginForm } from "./login-form";

/** 登录页：本地单用户模式（dev 默认）直接重定向进工作台，本页仅 AUTH_MODE=login 时渲染 */
export default function LoginPage() {
  if (isLocalSingleUserMode()) redirect("/dashboard");
  return <LoginForm />;
}
