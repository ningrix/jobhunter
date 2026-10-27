import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 桌面打包（desktop/）取 .next/standalone 作为服务端产物；Web/Docker 部署仍用 next start，不受影响
  output: "standalone",
  // 原生模块与重解析库不参与打包，直接 require
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "mammoth"],
  // 关闭 dev 模式左下角指示按钮，避免遮挡页面内容（仅影响 dev）
  devIndicators: false,
};

export default nextConfig;
