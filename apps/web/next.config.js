const path = require("path");

const withBundleAnalyzer = process.env.ANALYZE === "true"
  ? require("@next/bundle-analyzer")({ enabled: true })
  : (config) => config;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  devIndicators:false,
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["@prisma/client", "ioredis", "ssh2", "web-push", "ws", "graphql-ws"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "recharts"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // HubSpot widget loads sub-scripts from: hs-scripts, hs-banner, hstatic, hsappstatic,
              // hsforms, hscollectedforms, hs-analytics, usemessages
              process.env.NODE_ENV === "development"
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.hs-scripts.com https://*.hs-banner.com https://*.hsforms.net https://*.hsforms.com https://*.hstatic.net https://*.hsappstatic.net https://*.usemessages.com https://*.hs-analytics.net https://*.hscollectedforms.net"
                : "script-src 'self' 'unsafe-inline' https://*.hs-scripts.com https://*.hs-banner.com https://*.hsforms.net https://*.hsforms.com https://*.hstatic.net https://*.hsappstatic.net https://*.usemessages.com https://*.hs-analytics.net https://*.hscollectedforms.net",
              "style-src 'self' 'unsafe-inline' https://*.hstatic.net https://*.hsappstatic.net",
              "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.hubspot.com https://*.hubapi.com https://*.hstatic.net https://*.hsforms.com https://*.hsappstatic.net",
              "font-src 'self' https://*.hstatic.net https://*.hsappstatic.net",
              "media-src 'self' blob: https://*.r2.cloudflarestorage.com",
              "object-src 'self' blob: https://*.r2.cloudflarestorage.com",
              "frame-src 'self' blob: https://*.r2.cloudflarestorage.com https://*.hubspot.com https://*.hsforms.com",
              // HubSpot widget connects to: hubspot, hubapi, usemessages, hscollectedforms, hsforms, hsappstatic
              "connect-src 'self' ws: wss: https://*.r2.cloudflarestorage.com https://*.hubspot.com https://*.hubapi.com https://*.usemessages.com https://*.hscollectedforms.net https://*.hsforms.com https://*.hsappstatic.net https://ipapi.co",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
