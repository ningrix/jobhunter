import { bossJobSource } from "./adapters/boss";
import { mockJobSource } from "./adapters/mock";
import { liepinAdapter } from "./adapters/liepin";
import { zhilianAdapter } from "./adapters/zhilian";
import { lagouAdapter } from "./adapters/lagou";
import { job51Adapter } from "./adapters/job51";
import { registerJobSource } from "./core/registry";

let registered = false;

/** 注册内置来源（幂等）；业务入口（路由/导入服务）调用以确保来源可用 */
export function registerBuiltinJobSources(): void {
  if (registered) return;
  registerJobSource(bossJobSource);
  registerJobSource(mockJobSource);
  // 国内站点（V3 Phase 1）：统一仅辅助导入
  registerJobSource(liepinAdapter);
  registerJobSource(zhilianAdapter);
  registerJobSource(lagouAdapter);
  registerJobSource(job51Adapter);
  registered = true;
}
