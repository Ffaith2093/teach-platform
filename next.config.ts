import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb", // SPEC §7: 单文件 ≤ 100MB
    },
  },
  // SPEC §3.1：评测依赖 dockerode + ssh2 原生模块，避免被 webpack 解析
  serverExternalPackages: ["dockerode", "ssh2"],
  // Monaco editor 用 webpack 处理（默认已 OK）
};

export default nextConfig;
