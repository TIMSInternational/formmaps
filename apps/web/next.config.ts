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

function shouldRoutePcaReportToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_PCA_REPORT_TO_DOTNET)
  );
}

function shouldRouteLiaReportToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_LIA_REPORT_TO_DOTNET)
  );
}

function shouldRouteTimelineReportToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_TIMELINE_REPORT_TO_DOTNET)
  );
}

function shouldRouteCoachingReportToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_COACHING_REPORT_TO_DOTNET)
  );
}

function shouldRouteEvaluationReportToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_EVALUATION_REPORT_TO_DOTNET)
  );
}

function shouldRoutePcaExamSessionToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_SESSION_TO_DOTNET)
  );
}

function shouldRoutePcaExamCompletedToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_COMPLETED_EXAMS_TO_DOTNET)
  );
}

function shouldRoutePcaExamCatalogToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_CATALOG_TO_DOTNET)
  );
}

function shouldRouteLiaResultsToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_LIA_RESULTS_TO_DOTNET)
  );
}

function shouldRouteMilResultsToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_MIL_RESULTS_TO_DOTNET)
  );
}

function shouldRoutePersonalityResultsToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_PERSONALITY_RESULTS_TO_DOTNET)
  );
}

function shouldRoutePersonalityAccessToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PERSONALITY_ACCESS_TO_DOTNET)
  );
}

function shouldRoutePersonalitySessionToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PERSONALITY_SESSION_TO_DOTNET)
  );
}

function shouldRouteAssessmentTimelineToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_ASSESSMENT_TIMELINE_TO_DOTNET)
  );
}

function shouldRoutePcaExamConfigToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_CONFIG_TO_DOTNET)
  );
}

function shouldRoutePcaExamStatisticsToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_STATISTICS_TO_DOTNET)
  );
}

function shouldRoutePcaExamHistoryToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_HISTORY_TO_DOTNET)
  );
}

function shouldRoutePcaExamAllResultsToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_ALL_RESULTS_TO_DOTNET)
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
      ...(shouldRoutePcaReportToDotnet()
        ? [
            {
              source: "/api/v1/reports/pca/:userId",
              destination: `${dotnetApiBaseUrl}/api/v1/reports/pca/:userId`,
            },
          ]
        : []),
      ...(shouldRouteLiaReportToDotnet()
        ? [
            {
              source: "/api/v1/reports/lia/:userId",
              destination: `${dotnetApiBaseUrl}/api/v1/reports/lia/:userId`,
            },
          ]
        : []),
      ...(shouldRouteTimelineReportToDotnet()
        ? [
            {
              source: "/api/v1/reports/timeline/:userId",
              destination: `${dotnetApiBaseUrl}/api/v1/reports/timeline/:userId`,
            },
          ]
        : []),
      ...(shouldRouteCoachingReportToDotnet()
        ? [
            {
              source: "/api/v1/reports/coaching/:userId",
              destination: `${dotnetApiBaseUrl}/api/v1/reports/coaching/:userId`,
            },
          ]
        : []),
      ...(shouldRouteEvaluationReportToDotnet()
        ? [
            {
              source: "/api/v1/reports/evaluation/:sessionId",
              destination: `${dotnetApiBaseUrl}/api/v1/reports/evaluation/:sessionId`,
            },
          ]
        : []),
      ...(shouldRoutePcaExamSessionToDotnet()
        ? [
            {
              source: "/api/pcaexam/session/:sessionId",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/session/:sessionId`,
            },
          ]
        : []),
      ...(shouldRoutePcaExamCompletedToDotnet()
        ? [
            {
              source: "/api/pcaexam/completed-exams/:userId",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/completed-exams/:userId`,
            },
          ]
        : []),
      ...(shouldRoutePcaExamCatalogToDotnet()
        ? [
            {
              source: "/api/pcaexam/exams",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/exams`,
            },
            {
              source: "/api/pcaexam/exams/:examId",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/exams/:examId`,
            },
          ]
        : []),
      ...(shouldRouteLiaResultsToDotnet()
        ? [
            {
              source: "/api/v1/lia/session/:sessionId/results",
              destination: `${dotnetApiBaseUrl}/api/v1/lia/session/:sessionId/results`,
            },
            {
              source: "/api/v1/lia/user/:userId/results",
              destination: `${dotnetApiBaseUrl}/api/v1/lia/user/:userId/results`,
            },
          ]
        : []),
      ...(shouldRouteMilResultsToDotnet()
        ? [
            {
              source: "/api/v1/mil/results/:userId",
              destination: `${dotnetApiBaseUrl}/api/v1/mil/results/:userId`,
            },
          ]
        : []),
      ...(shouldRoutePersonalityResultsToDotnet()
        ? [
            {
              source: "/api/v1/personality/session/:sessionId/results",
              destination: `${dotnetApiBaseUrl}/api/v1/personality/session/:sessionId/results`,
            },
            {
              source: "/api/v1/personality/user/:userId/results",
              destination: `${dotnetApiBaseUrl}/api/v1/personality/user/:userId/results`,
            },
          ]
        : []),
      ...(shouldRoutePersonalityAccessToDotnet()
        ? [
            {
              source: "/api/v1/personality/access",
              destination: `${dotnetApiBaseUrl}/api/v1/personality/access`,
            },
          ]
        : []),
      ...(shouldRoutePersonalitySessionToDotnet()
        ? [
            {
              source: "/api/v1/personality/session/:sessionId",
              destination: `${dotnetApiBaseUrl}/api/v1/personality/session/:sessionId`,
            },
          ]
        : []),
      ...(shouldRouteAssessmentTimelineToDotnet()
        ? [
            {
              source: "/api/v1/assessments/me/timeline/stats",
              destination: `${dotnetApiBaseUrl}/api/v1/assessments/me/timeline/stats`,
            },
            {
              source: "/api/v1/assessments/me/timeline",
              destination: `${dotnetApiBaseUrl}/api/v1/assessments/me/timeline`,
            },
          ]
        : []),
      ...(shouldRoutePcaExamConfigToDotnet()
        ? [
            {
              source: "/api/pcaexam/exams/:examId/instructions",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/exams/:examId/instructions`,
            },
            {
              source: "/api/pcaexam/exam-config/:examId",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/exam-config/:examId`,
            },
          ]
        : []),
      ...(shouldRoutePcaExamStatisticsToDotnet()
        ? [
            {
              source: "/api/pcaexam/statistics/:examId",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/statistics/:examId`,
            },
          ]
        : []),
      ...(shouldRoutePcaExamHistoryToDotnet()
        ? [
            {
              source: "/api/pcaexam/history/:userId",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/history/:userId`,
            },
          ]
        : []),
      ...(shouldRoutePcaExamAllResultsToDotnet()
        ? [
            {
              source: "/api/pcaexam/all-results",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/all-results`,
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
