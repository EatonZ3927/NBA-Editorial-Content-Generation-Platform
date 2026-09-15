import type { NextConfig } from "next";

/**
 * GitHub Pages 纯静态导出配置：
 * - output: "export" 生成纯静态文件到 out/（无服务器运行时）
 * - trailingSlash: 每个路由导出为目录 + index.html，兼容 Pages 的静态服务
 * - images.unoptimized: 静态导出不支持 Next 图片优化服务，直接引用原图
 * - basePath: 仅部署到 Pages 子路径时由 CI 注入 PAGES_BASE_PATH（本地 dev 不带前缀）
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: process.env.PAGES_BASE_PATH || undefined,
};

export default nextConfig;
