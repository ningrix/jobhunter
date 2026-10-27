import path from "node:path";

/**
 * 数据根目录（唯一来源）。
 * - 桌面端：主进程注入 APP_DATA_DIR（%LOCALAPPDATA%\JobHunter\data），数据不落程序目录；
 * - dev / Docker / 测试：未设置时沿用 <cwd>/data，与历史行为逐位一致。
 */
const envDir = process.env.APP_DATA_DIR?.trim();
export const DATA_ROOT = envDir ? path.resolve(envDir) : path.join(process.cwd(), "data");
