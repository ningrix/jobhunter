/**
 * 登录模式判定（零依赖，可被客户端组件安全 import）。
 *
 * AUTH_MODE 取值：
 * - `local`：始终本地单用户免登录（桌面打包版由主进程注入）；
 * - `login`：始终走登录流程（dev 调试用）；
 * - 未设置：dev 默认免登录，production / test 必须登录（历史行为，保持不变）。
 */
export const LOCAL_MODE_ENV_KEY = "AUTH_MODE";

export function isLocalSingleUserMode(): boolean {
  const mode = (process.env.AUTH_MODE ?? "").trim().toLowerCase();
  if (mode === "local") return true;
  if (mode === "login") return false;
  return process.env.NODE_ENV === "development";
}
