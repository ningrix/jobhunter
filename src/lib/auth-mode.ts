/**
 * 登录模式判定（零依赖，可被客户端组件安全 import）。
 *
 * 本地单用户模式（开箱即用）：dev 默认免登录；AUTH_MODE=login 恢复登录流程；
 * 生产（NODE_ENV=production）与测试（NODE_ENV=test）始终关闭。
 */
export const LOCAL_MODE_ENV_KEY = "AUTH_MODE";

export function isLocalSingleUserMode(): boolean {
  return process.env.NODE_ENV === "development" && process.env.AUTH_MODE !== "login";
}
