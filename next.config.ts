import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cheap win at this route count: link hrefs are checked against real routes.
  typedRoutes: true,

  // Cache Components (`use cache`) is deliberately left off. Its default
  // storage is in-memory and per-instance, which on serverless would miss
  // constantly and hammer the rate provider. The `fetch` Data Cache used in
  // lib/rates.ts persists across instances and deployments instead.
};

export default nextConfig;
