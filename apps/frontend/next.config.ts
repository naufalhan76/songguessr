import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@distube/ytpl'],
  transpilePackages: ['@muze/shared'],
};

export default nextConfig;
