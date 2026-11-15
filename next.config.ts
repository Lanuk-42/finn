import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the Python pipeline and its caches are not part of the web bundle
  outputFileTracingExcludes: { "*": ["scripts/**", "data/cache/**"] },
};

export default nextConfig;
