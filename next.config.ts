import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/knitting-tracker',
  images: {
    unoptimized: true,
  },
  turbopack: {},
  webpack: (config) => {
    // Required for react-pdf
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
