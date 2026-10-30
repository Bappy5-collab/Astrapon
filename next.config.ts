import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Three.js ecosystem packages ship modern ESM; transpile for consistent builds.
  transpilePackages: ["three"],
};

export default nextConfig;
