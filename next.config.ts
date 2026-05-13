import type { NextConfig } from "next";

/**
 * Security headers applied to every response. Kept here (not in proxy.ts) so
 * static asset responses inherit them too — proxy/middleware misses cached
 * `_next/static/*` deliveries.
 *
 * CSP omitted deliberately for now: Clerk + Supabase + Sonner together need a
 * carefully-tuned policy and a wrong CSP is worse than no CSP (everything
 * breaks and the user disables it). Track follow-up in SECURITY.md.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Voice memo recorder uses the microphone; everything else is denied.
    value: "camera=(), geolocation=(), microphone=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Lets the Playwright dev-server smoke run against 127.0.0.1 without the
  // Next 16 cross-origin warning. Production deployments come in on the
  // Vercel-assigned host, so this only matters for local dev + e2e.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
