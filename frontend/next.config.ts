import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack config (Next.js 16 default bundler)
  // mind-ar's 'canvas' dependency is a native Node.js module not needed
  // in the browser (the browser uses its native Canvas API).
  reactStrictMode: false,
  turbopack: {
    resolveAlias: {
      canvas: { browser: "" },
      fs: { browser: "" },
      path: { browser: "" },
    },
  },

  // Fallback webpack config (for --webpack flag)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;
