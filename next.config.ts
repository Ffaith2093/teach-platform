import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb", // SPEC §7: 单文件 ≤ 100MB
    },
  },
  // Monaco editor 用 webpack 处理（默认已 OK）
};

export default nextConfig;
