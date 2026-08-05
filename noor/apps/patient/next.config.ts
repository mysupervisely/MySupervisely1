import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // M1 frontends are deliberately thin — they never talk to Postgres or
  // any provider SDK directly, only to the Noor API over HTTP. See
  // docs/noor/ARCHITECTURE.md §A/§L and docs/noor/M1-IMPLEMENTATION.md.
  reactStrictMode: true,
};

export default nextConfig;
