import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  // 组件 .tsx 无头渲染（自动 JSX 运行时，与 Next 构建一致）；不影响 Next 自身构建
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // 所有测试文件串行跑，共享同一个 SQLite 测试库
    fileParallelism: false,
    env: {
      DB_PATH: "./data/test.db",
      JWT_SECRET: "test-secret-test-secret-test-secret",
      AI_PROVIDER: "mock",
      AI_DAILY_LIMIT: "50",
    },
  },
});
