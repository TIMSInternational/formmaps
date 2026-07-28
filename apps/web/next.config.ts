import type { NextConfig } from "next";

// ── FormMaps → .NET migration: personality domain prod cutover (Milestone-1) ──
// The .NET backend serves the SAME /api/v1/personality/* paths. A route is proxied to
// .NET only when BOTH FORMMAPS_DOTNET_API_BASE_URL is set AND that route's per-route flag
// is on, so this whole block is INERT (dark) until the base URL is configured and a flag is
// flipped. Each flag maps to a distinct path (Next rewrites match by path, not method),
// giving per-route, instant rollback (set the flag to 0, or unset the base URL as a global
// kill-switch). Helpers ported verbatim from the monorepo apps/web/next.config.ts, proven
// on the staging .NET service.
const dotnetApiBaseUrl = process.env.FORMMAPS_DOTNET_API_BASE_URL?.replace(/\/+$/, "");

function isEnabled(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function shouldRoutePersonalityAccessToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PERSONALITY_ACCESS_TO_DOTNET));
}
function shouldRoutePersonalitySessionToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PERSONALITY_SESSION_TO_DOTNET));
}
function shouldRoutePersonalityResultsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PERSONALITY_RESULTS_TO_DOTNET));
}
function shouldRoutePersonalityStartToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PERSONALITY_START_TO_DOTNET));
}
function shouldRoutePersonalityAnswerToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PERSONALITY_ANSWER_TO_DOTNET));
}
function shouldRoutePersonalityCompleteToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PERSONALITY_COMPLETE_TO_DOTNET));
}

// ── Wave 2 Batch 1: LIA/MIL results reads + pca-exam catalog/config reads ──
// Ported verbatim from the monorepo apps/web/next.config.ts (G13 — rewrites
// only take effect in THIS file, which is what app.formmaps.com actually
// deploys from).
function shouldRouteLiaResultsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_LIA_RESULTS_TO_DOTNET));
}
function shouldRouteMilResultsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_MIL_RESULTS_TO_DOTNET));
}
function shouldRoutePcaExamConfigToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_CONFIG_TO_DOTNET));
}

// ── Wave 2 Batch 2: pca-exam session/history/completed-exams reads ──
function shouldRoutePcaExamSessionToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_SESSION_TO_DOTNET));
}
function shouldRoutePcaExamHistoryToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_HISTORY_TO_DOTNET));
}
function shouldRoutePcaExamCompletedExamsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_COMPLETED_EXAMS_TO_DOTNET));
}

// ── Wave 2 Batch 3: test-scores (superscore/college-fit) + question360 reads ──
function shouldRouteTestScoresReadsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_TEST_SCORES_READS_TO_DOTNET));
}
function shouldRouteQuestion360ReadsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_QUESTION360_READS_TO_DOTNET));
}

// ── Wave 2 Batch 4: school-admin reads (overview/results/pca-status/status) ──
// /assessments/config + /assessments/schedule stay dark — those paths also
// carry Node-only PUTs (Next matches by path not method).
function shouldRouteSchoolAdminReadsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_ADMIN_READS_TO_DOTNET));
}

// ── Reports domain: benchmark/user-report/pca/lia/timeline/coaching/evaluation reads ──
// .NET server code for all 7 was already deployed before Wave 2 batch numbering existed;
// this block was never ported into this file until now. Ported verbatim from the
// monorepo apps/web/next.config.ts (lines 11-57 / 813-868), proven on staging.
function shouldRouteBenchmarkReportToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_BENCHMARK_REPORT_TO_DOTNET));
}
function shouldRouteUserReportToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_USER_REPORT_TO_DOTNET));
}
function shouldRoutePcaReportToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PCA_REPORT_TO_DOTNET));
}
function shouldRouteLiaReportToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_LIA_REPORT_TO_DOTNET));
}
function shouldRouteTimelineReportToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_TIMELINE_REPORT_TO_DOTNET));
}
function shouldRouteCoachingReportToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_COACHING_REPORT_TO_DOTNET));
}
function shouldRouteEvaluationReportToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_EVALUATION_REPORT_TO_DOTNET));
}

// ── School-analytics reads (FM-DOTNET-049): overview/trends/performance-trends/top-performers ──
// Ported verbatim from ~/formmaps/apps/web/next.config.ts (lines 316-323 / 1222-1245) — that copy
// is NOT a deploy target (no linked Vercel project), this file is. /trends and /performance-trends
// hit the identical service call.
function shouldRouteSchoolAnalyticsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_ANALYTICS_TO_DOTNET));
}

// ── Vocational-360 reads (FM-DOTNET-033/034): catalog (instrument/questionnaire, no per-user
// gate) + result reads (score/integrated, canAccessUser-gated). Two flags so catalog (no IDOR
// risk) and result reads (per-user) can be flipped/rolled back independently. Recompute WRITES
// and /recommendations (Bedrock) stay Node — not part of this cutover.
function shouldRouteVocationalCatalogToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VOCATIONAL_CATALOG_TO_DOTNET));
}
function shouldRouteVocationalResultReadsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VOCATIONAL_RESULT_READS_TO_DOTNET));
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
    const target = process.env.API_PROXY_TARGET || "https://5t8ch34ijm.us-east-1.awsapprunner.com";
    // Personality → .NET (dark until FORMMAPS_DOTNET_API_BASE_URL is set + a flag is on).
    // MUST precede the /api/:path* catch-all below so a flipped route reaches .NET. The
    // /session/:sessionId sub-paths (results/answer/complete) precede the bare
    // /session/:sessionId (Next matches array order, first match wins).
    const personalityRewrites = [
      ...(shouldRoutePersonalityAccessToDotnet()
        ? [{ source: "/api/v1/personality/access", destination: `${dotnetApiBaseUrl}/api/v1/personality/access` }]
        : []),
      ...(shouldRoutePersonalityResultsToDotnet()
        ? [{ source: "/api/v1/personality/session/:sessionId/results", destination: `${dotnetApiBaseUrl}/api/v1/personality/session/:sessionId/results` }]
        : []),
      ...(shouldRoutePersonalityAnswerToDotnet()
        ? [{ source: "/api/v1/personality/session/:sessionId/answer", destination: `${dotnetApiBaseUrl}/api/v1/personality/session/:sessionId/answer` }]
        : []),
      ...(shouldRoutePersonalityCompleteToDotnet()
        ? [{ source: "/api/v1/personality/session/:sessionId/complete", destination: `${dotnetApiBaseUrl}/api/v1/personality/session/:sessionId/complete` }]
        : []),
      ...(shouldRoutePersonalitySessionToDotnet()
        ? [{ source: "/api/v1/personality/session/:sessionId", destination: `${dotnetApiBaseUrl}/api/v1/personality/session/:sessionId` }]
        : []),
      ...(shouldRoutePersonalityResultsToDotnet()
        ? [{ source: "/api/v1/personality/user/:userId/results", destination: `${dotnetApiBaseUrl}/api/v1/personality/user/:userId/results` }]
        : []),
      ...(shouldRoutePersonalityStartToDotnet()
        ? [{ source: "/api/v1/personality/start", destination: `${dotnetApiBaseUrl}/api/v1/personality/start` }]
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
      ...(shouldRoutePcaExamSessionToDotnet()
        ? [
            {
              source: "/api/pcaexam/session/:sessionId",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/session/:sessionId`,
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
      ...(shouldRoutePcaExamCompletedExamsToDotnet()
        ? [
            {
              source: "/api/pcaexam/completed-exams/:userId",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/completed-exams/:userId`,
            },
          ]
        : []),
      ...(shouldRouteTestScoresReadsToDotnet()
        ? [
            {
              source: "/api/v1/test-scores/superscore",
              destination: `${dotnetApiBaseUrl}/api/v1/test-scores/superscore`,
            },
            {
              source: "/api/v1/test-scores/college-fit",
              destination: `${dotnetApiBaseUrl}/api/v1/test-scores/college-fit`,
            },
            {
              source: "/api/v1/test-scores/students/:id/test-scores",
              destination: `${dotnetApiBaseUrl}/api/v1/test-scores/students/:id/test-scores`,
            },
          ]
        : []),
      ...(shouldRouteQuestion360ReadsToDotnet()
        ? [
            {
              source: "/api/question360/GetQuestions",
              destination: `${dotnetApiBaseUrl}/api/question360/GetQuestions`,
            },
            {
              source: "/api/question360/all",
              destination: `${dotnetApiBaseUrl}/api/question360/all`,
            },
            {
              source: "/api/question360/category/:category",
              destination: `${dotnetApiBaseUrl}/api/question360/category/:category`,
            },
            {
              source: "/api/question360/sub-questions/:parentQuestionId",
              destination: `${dotnetApiBaseUrl}/api/question360/sub-questions/:parentQuestionId`,
            },
            {
              source: "/api/question360/:id",
              destination: `${dotnetApiBaseUrl}/api/question360/:id`,
            },
          ]
        : []),
      ...(shouldRouteSchoolAdminReadsToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/evaluations/overview",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/evaluations/overview`,
            },
            {
              source: "/api/v1/school-admin/results/:studentId/pca-status",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/results/:studentId/pca-status`,
            },
            {
              source: "/api/v1/school-admin/results",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/results`,
            },
            {
              source: "/api/v1/school-admin/assessments/status",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/assessments/status`,
            },
          ]
        : []),
      ...(shouldRouteBenchmarkReportToDotnet()
        ? [{ source: "/api/v1/reports/benchmark", destination: `${dotnetApiBaseUrl}/api/v1/reports/benchmark` }]
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
        ? [{ source: "/api/v1/reports/pca/:userId", destination: `${dotnetApiBaseUrl}/api/v1/reports/pca/:userId` }]
        : []),
      ...(shouldRouteLiaReportToDotnet()
        ? [{ source: "/api/v1/reports/lia/:userId", destination: `${dotnetApiBaseUrl}/api/v1/reports/lia/:userId` }]
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
      ...(shouldRouteSchoolAnalyticsToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/analytics/overview",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/analytics/overview`,
            },
            {
              source: "/api/v1/school-admin/analytics/trends",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/analytics/trends`,
            },
            {
              source: "/api/v1/school-admin/analytics/performance-trends",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/analytics/performance-trends`,
            },
            {
              source: "/api/v1/school-admin/analytics/top-performers",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/analytics/top-performers`,
            },
          ]
        : []),
      ...(shouldRouteVocationalCatalogToDotnet()
        ? [
            { source: "/api/v1/vocational360/instrument", destination: `${dotnetApiBaseUrl}/api/v1/vocational360/instrument` },
            { source: "/api/v1/vocational360/questionnaire", destination: `${dotnetApiBaseUrl}/api/v1/vocational360/questionnaire` },
          ]
        : []),
      ...(shouldRouteVocationalResultReadsToDotnet()
        ? [
            {
              source: "/api/v1/vocational360/score/:evaluatedUserId",
              destination: `${dotnetApiBaseUrl}/api/v1/vocational360/score/:evaluatedUserId`,
            },
            {
              source: "/api/v1/vocational360/integrated/:evaluatedUserId",
              destination: `${dotnetApiBaseUrl}/api/v1/vocational360/integrated/:evaluatedUserId`,
            },
          ]
        : []),
    ];
    return {
      afterFiles: [
        ...personalityRewrites,
        { source: "/api/:path*", destination: `${target}/api/:path*` },
        { source: "/authapi/:path*", destination: `${target}/authapi/:path*` },
        { source: "/evaluation/:path*", destination: `${target}/evaluation/:path*` },
      ],
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
