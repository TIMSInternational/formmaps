import type { NextConfig } from "next";

const legacyApiProxyTarget =
  process.env.API_PROXY_TARGET || "https://5t8ch34ijm.us-east-1.awsapprunner.com";
const dotnetApiBaseUrl = process.env.FORMMAPS_DOTNET_API_BASE_URL?.replace(/\/+$/, "");

function isEnabled(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function shouldRouteBenchmarkReportToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_BENCHMARK_REPORT_TO_DOTNET)
  );
}

function shouldRouteUserReportToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_USER_REPORT_TO_DOTNET)
  );
}

const nextConfig: NextConfig = {
  /**
   * Allow external image hosts used in the app (e.g. Unsplash)
   */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "grainy-gradients.vercel.app",
      },
      {
        protocol: "https",
        hostname: "d3njjcbhbojbot.cloudfront.net",
      },
      {
        protocol: "https",
        hostname: "coursera-course-photos.s3.amazonaws.com",
      },
    ],
  },

  /**
   * Production optimizations
   */
  devIndicators: false,

  experimental: {
    // Tree-shake and optimize imports for heavy icon/chart libraries
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
      "@radix-ui/react-icons",
      "date-fns",
    ],
  },

  /**
   * Compiler optimizations
   */
  compiler: {
    // Remove console.log in production builds
    removeConsole: process.env.NODE_ENV === "production",
  },

  /**
   * Enable React Strict Mode for better development experience
   */
  reactStrictMode: true,

  /**
   * Improve build output
   */
  poweredByHeader: false,

  /**
   * Same-origin API proxy.
   *
   * The browser calls RELATIVE paths (/api, /authapi, /evaluation) — i.e.
   * NEXT_PUBLIC_API_BASE_URL is empty in prod — and Next proxies them server-side
   * to the Express backend. This makes the API same-ORIGIN with the app, so the
   * auth cookies are FIRST-PARTY (no longer blocked as third-party, which was the
   * cross-site 401 loop) while staying httpOnly (no tokens in JS → no XSS theft).
   *
   * `afterFiles` → the app's own /api/* route handlers (e.g. /api/admin/courses)
   * are matched first; only unmatched paths proxy to the backend.
   *
   * API_PROXY_TARGET defaults to the prod backend so a missing env var can't
   * silently break the proxy. Local dev keeps NEXT_PUBLIC_API_BASE_URL pointed at
   * http://localhost:3001 (direct, same-site) and never hits this rewrite.
   */
  async rewrites() {
    const afterFiles = [
      ...(shouldRouteBenchmarkReportToDotnet()
        ? [
            {
              source: "/api/v1/reports/benchmark",
              destination: `${dotnetApiBaseUrl}/api/v1/reports/benchmark`,
            },
          ]
        : []),
      ...(shouldRouteUserReportToDotnet()
        ? [
            {
              source: "/api/v1/reports/user-report/:userId",
              destination: `${dotnetApiBaseUrl}/api/v1/reports/user-report/:userId`,
            },
          ]
        : []),
      { source: "/api/:path*", destination: `${legacyApiProxyTarget}/api/:path*` },
      { source: "/authapi/:path*", destination: `${legacyApiProxyTarget}/authapi/:path*` },
      { source: "/evaluation/:path*", destination: `${legacyApiProxyTarget}/evaluation/:path*` },
    ];

    return {
      afterFiles,
    };
  },

  /**
   * Security headers — applied to all routes
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "0" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // React dev mode needs eval() for debugging (callstack reconstruction);
              // never allowed in production builds.
              // 'wasm-unsafe-eval' (prod): the resume "Edited" live preview (@react-pdf/renderer)
              // compiles its yoga-layout WASM engine — the narrow WASM directive, not full eval().
              process.env.NODE_ENV === "development"
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://images.unsplash.com https://*.amazonaws.com",
              // *.amazonaws.com: pdf.js fetches presigned S3 PDFs (resume original-doc thumbnails) over XHR.
              // data:: @react-pdf/renderer fetches its yoga-layout WASM binary as a data: URL.
              "connect-src 'self' data: http://localhost:* https://*.formmaps.ai https://cognito-idp.us-east-1.amazonaws.com https://*.amazonaws.com https://*.timshr.com https://*.awsapprunner.com https://*.daily.co https://*.wss.daily.co wss://*.daily.co",
              // *.amazonaws.com: the resume "Original" pane iframes the presigned S3 PDF inline.
              // blob:: the resume "Edited" live preview (@react-pdf/renderer PDFViewer) frames a blob: URL.
              "frame-src 'self' blob: https://*.amazonaws.com https://timshr.com https://*.timshr.com https://*.daily.co",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
