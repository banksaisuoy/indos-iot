import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // NOTE: X-Frame-Options removed — it conflicts with CSP frame-ancestors
          // and "ALLOWALL" is non-standard (browsers treat unknown values as DENY).
          // Using CSP frame-ancestors instead (modern standard).
          // Allow embedding from space-z.ai preview panels + same origin.
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://*.space-z.ai http://*.space-z.ai https://space-z.ai http://space-z.ai *" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
