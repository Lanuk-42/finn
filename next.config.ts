import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the Python pipeline and its caches are not part of the web bundle
  outputFileTracingExcludes: { "*": ["scripts/**", "data/cache/**"] },
  // the snapshot API falls back to saved screener copies when the live fetch fails
  outputFileTracingIncludes: { "/api/snapshot/[ticker]": ["./data/screener/**"], "/api/ask": ["./data/transcripts/**"], "/api/promise/[ticker]": ["./data/promises/**"] },
};

export default nextConfig;
