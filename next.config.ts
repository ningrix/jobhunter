import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 原生模块与重解析库不参与打包，直接 require
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "mammoth"],
  // 关闭 dev 模式左下角指示按钮，避免遮挡页面内容（仅影响 dev）
  devIndicators: false,
};

export default nextConfig;
