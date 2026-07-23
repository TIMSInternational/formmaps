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

function shouldRouteLiaCompleteToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_LIA_COMPLETE_TO_DOTNET)
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

function shouldRoutePersonalityStartToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PERSONALITY_START_TO_DOTNET)
  );
}

function shouldRoutePersonalityAnswerToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PERSONALITY_ANSWER_TO_DOTNET)
  );
}

function shouldRoutePersonalityCompleteToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PERSONALITY_COMPLETE_TO_DOTNET)
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

function shouldRoutePcaExamStartToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_START_TO_DOTNET)
  );
}

function shouldRoutePcaExamSubmitToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PCAEXAM_SUBMIT_TO_DOTNET)
  );
}

function shouldRouteVocationalScoreRecomputeToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VOCATIONAL_SCORE_RECOMPUTE_TO_DOTNET)
  );
}

function shouldRouteVocationalIntegratedRecomputeToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VOCATIONAL_INTEGRATED_RECOMPUTE_TO_DOTNET)
  );
}

function shouldRouteVocationalScoreReadToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VOCATIONAL_SCORE_READ_TO_DOTNET)
  );
}

function shouldRouteVocationalIntegratedReadToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VOCATIONAL_INTEGRATED_READ_TO_DOTNET)
  );
}

function shouldRouteVocationalCatalogToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VOCATIONAL_CATALOG_TO_DOTNET)
  );
}

function shouldRouteTestScoresSuperscoreToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_TEST_SCORES_SUPERSCORE_TO_DOTNET)
  );
}

function shouldRouteTestScoresCollegeFitToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_TEST_SCORES_COLLEGE_FIT_TO_DOTNET)
  );
}

function shouldRouteTestScoresStudentViewToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_TEST_SCORES_STUDENT_VIEW_TO_DOTNET)
  );
}

// FM-DOTNET test-scores bare-path list + writes (GET / list, POST /, PUT /:id, DELETE /:id). One flag gates
// the whole bare-path router because Next rewrites match by PATH, not method (the bare path and the /:id path
// cannot be split by verb).
function shouldRouteTestScoresWriteToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_TEST_SCORES_WRITE_TO_DOTNET)
  );
}

// School-admin READS (FM-DOTNET sub-slice 1): the six straightforward school-scoped reads cut over as one
// group behind a single flag (low-risk, no dual-write). The deferred /results/:studentId report,
// /results/export CSV, /assessments/pipeline, and the polyglot /assessments/insights stay on Node (fall
// through to the /api/:path* catch-all).
function shouldRouteSchoolAdminReadsToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_ADMIN_READS_TO_DOTNET)
  );
}

// School-admin CONFIG + SCHEDULE writes (FM-DOTNET-044): the /assessments/config and /assessments/schedule
// paths each serve a GET (read, FM-039) AND a PUT (write, FM-044). Next rewrites match by PATH not method, so
// both methods cut over together under ONE flag — the only non-split-brain design (same rationale as
// question360). FM-039 deliberately left these two paths on Node because their PUTs were still Node-only; now
// that both PUTs are .NET-capable the paths can flip. Default off (dark).
function shouldRouteSchoolAdminConfigScheduleToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_ADMIN_CONFIG_SCHEDULE_TO_DOTNET)
  );
}

// School-admin EMAIL writes (FM-DOTNET-045): POST /assessments/send-reminders + /assessments/setup-360. These
// send SES email (send-reminders) and bulk-create evaluation_groups + fire invites (setup-360). POST-only paths
// (no GET twin), so no path-not-method coupling — one flag. Default off (dark). Cutover prereq: the prod App
// Runner role needs ses:SendEmail + a verified SES sender identity.
function shouldRouteSchoolAdminEmailWritesToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_ADMIN_EMAIL_WRITES_TO_DOTNET)
  );
}

// question360 (FM-DOTNET question360) — ONE flag covers the WHOLE surface: all 5 GET reads + all 6 writes. A
// single flag is the only design with no misconfigurable state: Next rewrites match by PATH not method, so the
// `/api/question360/:id` rewrite cannot distinguish GET (read) from PUT/DELETE (write), and `/bulk-create`
// matches the `/:id` shape — splitting reads and writes onto two flags would route writes to .NET whenever the
// reads flag was on regardless of a writes flag. So reads + writes are one surface that cuts over together.
// Default OFF (this replaces the FM-038 reads-only flag; renaming is safe — it was default-off, never set in prod).
function shouldRouteQuestion360ToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_QUESTION360_TO_DOTNET)
  );
}

// FM-DOTNET capstone — the token-gated external write rail. Two flags (one per tree) give independent prod
// rollback of the two highest-risk write paths. These paths are under /evaluation/* (NOT /api/*) — the .NET
// service mounts them at /evaluation and /evaluation/vocational, matching the legacy Express mount. Both
// default OFF (dark). Each tree's reads + writes cut over together (path-not-method rewrites).
function shouldRouteVocationalTakeToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VOCATIONAL_TAKE_TO_DOTNET)
  );
}

function shouldRouteEvalExternalToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_EVAL_EXTERNAL_TO_DOTNET)
  );
}

// FM-DOTNET Phase-B — the gradebook transcript read (routes/school-gradebook.ts GET
// /gradebook/students/:studentId, mounted under /api/v1/school-admin). GET-only (the grade writes in that
// file stay Node), so there is no path-not-method coupling. Default OFF (dark). Its path prefix
// (gradebook/students) is disjoint from the school-admin /results and /assessments rewrites.
function shouldRouteGradebookReadToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_GRADEBOOK_READ_TO_DOTNET)
  );
}

// School-admin CALENDAR reads + writes (FM-DOTNET-048) — the whole /calendar/* surface (3 GET reads from
// FM-047 + the 9 writes ported here) cuts over under ONE flag. Next rewrites match by PATH not method, and the
// bare /calendar/academic-years, /assessment-periods, /holidays paths each serve BOTH a GET (read) AND a POST
// (create), so reads and writes MUST flip together — the only non-split-brain design (same rationale as
// config/schedule and question360). FM-047 deliberately shipped the reads dark WITHOUT a rewrite for exactly
// this reason; FM-048 co-ports the writes and adds the rewrite. Default off (dark).
function shouldRouteSchoolAdminCalendarToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_ADMIN_CALENDAR_TO_DOTNET)
  );
}

// School-admin ANALYTICS reads (FM-DOTNET-049) — routes/school.ts /analytics/{overview,trends,
// performance-trends,top-performers}, mounted under /api/v1/school-admin. All four are method-unambiguous GETs
// (no POST/PUT twin on these paths), so this is a straight read cut-over (not dark) behind ONE flag. Default OFF.
function shouldRouteSchoolAnalyticsToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_ANALYTICS_TO_DOTNET)
  );
}

// School:manage READS (FM-DOTNET-050) — routes/school.ts /dashboard/stats, /counselor-assignments/all, /notes,
// /counselor-workload, mounted under /api/v1/school-admin. All four are method-unambiguous GETs (no POST/PUT twin
// on these paths), so this is a straight read cut-over (not dark) behind ONE flag. Default OFF. Disjoint from the
// /results, /assessments, /gradebook, /calendar and /analytics rewrite blocks.
function shouldRouteSchoolReadsToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_READS_TO_DOTNET)
  );
}

// School:manage PROFILE + SETTINGS reads + writes (FM-DOTNET-051) — routes/school.ts /school/profile and
// /settings, mounted under /api/v1/school-admin. Each path serves a GET (read) AND a PUT (write), so both methods
// cut over together under ONE flag — Next rewrites match by PATH not method, so a reads-only flag would drag the
// PUTs to .NET too (the only non-split-brain design; same rationale as config/schedule, calendar, question360).
// This slice is the .NET write-owner for the schools table's profile/settings columns. Default OFF (dark).
// Disjoint from the /results, /assessments, /gradebook, /calendar, /analytics and FM-050 read rewrite blocks.
function shouldRouteSchoolProfileSettingsToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_PROFILE_SETTINGS_TO_DOTNET)
  );
}

// School:users CLUSTER (FM-DOTNET-052) — routes/school.ts GET /users, PUT /users/:userId/grade-level,
// POST+DELETE /counselors/:counselorId/assign-students, GET /counselors/:counselorId/students, mounted under
// /api/v1/school-admin. Reads + writes cut over TOGETHER under ONE flag — Next rewrites match by PATH not method,
// and /counselors/:counselorId/assign-students serves BOTH POST and DELETE, so a method-split is impossible (same
// rationale as calendar / profile-settings). This slice is the .NET write-owner for users.gradeLevel and the
// counselor_student_assignments table via the school:users routes. Default OFF (dark). Disjoint from every other
// school-admin rewrite block: FM-050 uses /dashboard/stats, /counselor-assignments/all, /notes,
// /counselor-workload; FM-049 uses /analytics/*; none match /users or /counselors/*.
function shouldRouteSchoolUsersToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_USERS_TO_DOTNET)
  );
}

// iSAMS integration READS (FM-DOTNET-053) — routes/school.ts GET /integrations/isams/status and
// /integrations/isams/jobs, mounted under /api/v1/school-admin. READS-ONLY: the POST configure/sync/test paths
// (/integrations/isams, /integrations/isams/sync, /integrations/isams/test) stay in Node (vendor boundary) and are
// deliberately NOT rewritten. Both rewritten paths are GET-only with NO sibling write on the same path, so there is
// NO path-not-method hazard. Default OFF (dark). Disjoint from every other school-admin rewrite block. More specific
// than the /api/:path* catch-all → placed before it.
function shouldRouteIsamsReadsToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_ISAMS_READS_TO_DOTNET)
  );
}

// School-courses GET + POST /courses (FM-DOTNET-054) — routes/school-courses.ts, mounted under /api/v1/school-admin.
// ONE flag gates the EXACT literal path /courses (GET list + POST create cut over TOGETHER — Next rewrites match by
// PATH not method, and the bare /courses serves both GET and POST). Because the source is the exact literal /courses
// (no trailing segment), it does NOT match /courses/:courseId, /courses/pathways, /courses/import, /courses/ai-import,
// /courses/import/:jobId, etc. — those un-ported siblings stay on Node (fall through to the /api/:path* catch-all).
// The PUT/DELETE /courses/:courseId writes are deliberately NOT ported (that :courseId path collides with the
// siblings above). Default OFF (dark). Disjoint from every other school-admin rewrite block.
function shouldRouteSchoolCoursesToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_COURSES_TO_DOTNET)
  );
}

// Curriculum FRAMEWORKS (FM-DOTNET-055) — routes/school-courses.ts, mounted under /api/v1/school-admin: the FOUR
// /curriculum/frameworks endpoints ONLY (GET+PUT /curriculum/frameworks, GET /curriculum/frameworks/:type/courses,
// PUT /curriculum/frameworks/:type/courses/:courseId). The /courses, /data-mapping, /prerequisite and AI routes on the
// same router stay on Node (fall through to the /api/:path* catch-all). Reads + writes flip together under ONE flag —
// Next rewrites match by PATH not method, and /curriculum/frameworks serves BOTH GET and PUT, so a method-split is
// impossible. The three path shapes have DISTINCT segment counts (…/frameworks, …/frameworks/:type/courses,
// …/frameworks/:type/courses/:courseId) → no mutual collision; all disjoint from /courses/* and every other
// school-admin block; more specific than the /api/:path* catch-all, so they must precede it. Default OFF (dark).
function shouldRouteCurriculumFrameworksToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_CURRICULUM_FRAMEWORKS_TO_DOTNET)
  );
}

// Data-mappings (FM-DOTNET-056) — routes/school-courses.ts, mounted under /api/v1/school-admin: EXACTLY the two
// literal paths GET+POST /data-mappings (co-flip; path-not-method) and POST /data-mappings/bulk-approve. Both sources
// are EXACT literals (no trailing segment / wildcard), so /data-mappings does NOT match /data-mappings/:id nor
// /data-mappings/ai-suggest, and /data-mappings/bulk-approve is its own literal — NO collision with the un-ported
// PUT/DELETE /data-mappings/:id or the /data-mappings/ai-suggest (Bedrock) route, which stay on Node (fall through to
// the /api/:path* catch-all). Disjoint from /courses/*, /curriculum/* and every other school-admin block; more
// specific than the /api/:path* catch-all, so they must precede it. Default OFF (dark).
function shouldRouteDataMappingsToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_DATA_MAPPINGS_TO_DOTNET)
  );
}

// Prerequisites (FM-DOTNET-057) — routes/school-courses.ts, mounted under /api/v1/school-admin: 5 specific paths —
// GET /courses/:courseId/prerequisite-chain, PUT /courses/:courseId/prerequisites, and GET
// /prerequisites/{check/:studentId/:courseId, eligible/:studentId, missing/:studentId/:courseId}. The two /courses/:id/*
// sub-paths are MORE specific than the deferred bare /courses/:courseId (PUT/DELETE) — no collision. The /prerequisites/*
// block is disjoint from every other school-admin route. All five precede the /api/:path* catch-all. Default OFF (dark).
function shouldRoutePrerequisitesToDotnet() {
  return Boolean(
    dotnetApiBaseUrl &&
      isEnabled(process.env.FORMMAPS_ROUTE_PREREQUISITES_TO_DOTNET)
  );
}

// Derived pathways (FM-DOTNET-058) — routes/school-courses.ts, mounted under /api/v1/school-admin: ONE path,
// GET /courses/pathways (curriculum:manage). The literal "pathways" segment is MORE specific than the deferred bare
// /courses/:courseId (PUT/DELETE, still Node) and is disjoint from the FM-054 exact /courses and every other route,
// so it is collision-free (no negative-lookahead needed). Must precede the /api/:path* catch-all. Default OFF (dark).
function shouldRoutePathwaysToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PATHWAYS_TO_DOTNET)
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
      // POST /api/v1/lia/session/:sessionId/complete — the FIRST authored WRITE routed to .NET.
      // Default OFF; the prod route-flip stays deferred until the take/submit slice owns the whole
      // session lifecycle (porting only /complete while Node owns /start,/answer,/timeout is a
      // dual-write on lia_assessment_sessions — fine only for the flag-gated staging proof).
      ...(shouldRouteLiaCompleteToDotnet()
        ? [
            {
              source: "/api/v1/lia/session/:sessionId/complete",
              destination: `${dotnetApiBaseUrl}/api/v1/lia/session/:sessionId/complete`,
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
      // Personality WRITE lifecycle (FM-DOTNET-030) — start / answer / complete. Default OFF. Because
      // .NET owns the whole lifecycle there is no dual-write, so (unlike LIA) this domain is
      // prod-cut-over-able once validated. Each flag is independent so the flip can be staged.
      ...(shouldRoutePersonalityStartToDotnet()
        ? [
            {
              source: "/api/v1/personality/start",
              destination: `${dotnetApiBaseUrl}/api/v1/personality/start`,
            },
          ]
        : []),
      ...(shouldRoutePersonalityAnswerToDotnet()
        ? [
            {
              source: "/api/v1/personality/session/:sessionId/answer",
              destination: `${dotnetApiBaseUrl}/api/v1/personality/session/:sessionId/answer`,
            },
          ]
        : []),
      ...(shouldRoutePersonalityCompleteToDotnet()
        ? [
            {
              source: "/api/v1/personality/session/:sessionId/complete",
              destination: `${dotnetApiBaseUrl}/api/v1/personality/session/:sessionId/complete`,
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
      ...(shouldRoutePcaExamStartToDotnet()
        ? [
            {
              source: "/api/pcaexam/exams/:examId/start",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/exams/:examId/start`,
            },
          ]
        : []),
      ...(shouldRoutePcaExamSubmitToDotnet()
        ? [
            {
              source: "/api/pcaexam/submit",
              destination: `${dotnetApiBaseUrl}/api/pcaexam/submit`,
            },
          ]
        : []),
      ...(shouldRouteVocationalScoreRecomputeToDotnet()
        ? [
            {
              source: "/api/v1/vocational360/score/:evaluatedUserId/recompute",
              destination: `${dotnetApiBaseUrl}/api/v1/vocational360/score/:evaluatedUserId/recompute`,
            },
          ]
        : []),
      ...(shouldRouteVocationalIntegratedRecomputeToDotnet()
        ? [
            {
              source: "/api/v1/vocational360/integrated/:evaluatedUserId/recompute",
              destination: `${dotnetApiBaseUrl}/api/v1/vocational360/integrated/:evaluatedUserId/recompute`,
            },
          ]
        : []),
      ...(shouldRouteVocationalScoreReadToDotnet()
        ? [
            {
              source: "/api/v1/vocational360/score/:evaluatedUserId",
              destination: `${dotnetApiBaseUrl}/api/v1/vocational360/score/:evaluatedUserId`,
            },
          ]
        : []),
      ...(shouldRouteVocationalIntegratedReadToDotnet()
        ? [
            {
              source: "/api/v1/vocational360/integrated/:evaluatedUserId",
              destination: `${dotnetApiBaseUrl}/api/v1/vocational360/integrated/:evaluatedUserId`,
            },
          ]
        : []),
      ...(shouldRouteVocationalCatalogToDotnet()
        ? [
            {
              source: "/api/v1/vocational360/instrument",
              destination: `${dotnetApiBaseUrl}/api/v1/vocational360/instrument`,
            },
            {
              source: "/api/v1/vocational360/questionnaire",
              destination: `${dotnetApiBaseUrl}/api/v1/vocational360/questionnaire`,
            },
          ]
        : []),
      ...(shouldRouteTestScoresSuperscoreToDotnet()
        ? [
            {
              source: "/api/v1/test-scores/superscore",
              destination: `${dotnetApiBaseUrl}/api/v1/test-scores/superscore`,
            },
          ]
        : []),
      ...(shouldRouteTestScoresCollegeFitToDotnet()
        ? [
            {
              source: "/api/v1/test-scores/college-fit",
              destination: `${dotnetApiBaseUrl}/api/v1/test-scores/college-fit`,
            },
          ]
        : []),
      ...(shouldRouteTestScoresStudentViewToDotnet()
        ? [
            {
              source: "/api/v1/test-scores/students/:id/test-scores",
              destination: `${dotnetApiBaseUrl}/api/v1/test-scores/students/:id/test-scores`,
            },
          ]
        : []),
      // FM-DOTNET test-scores bare-path list + writes. Placed AFTER the superscore/college-fit/student-view
      // rewrites so those literal reads win when their own flags are on. NOTE: the "/:id" rewrite also matches
      // GET /superscore and /college-fit (single-segment) — those resolve to the SAME .NET endpoints, so
      // enabling this flag also routes those two reads to .NET even when their dedicated flags are off
      // (harmless; identical backend). There is no legacy GET /:id route. Must precede the /api/:path* catch-all.
      ...(shouldRouteTestScoresWriteToDotnet()
        ? [
            {
              source: "/api/v1/test-scores",
              destination: `${dotnetApiBaseUrl}/api/v1/test-scores`,
            },
            {
              source: "/api/v1/test-scores/:id",
              destination: `${dotnetApiBaseUrl}/api/v1/test-scores/:id`,
            },
          ]
        : []),
      // School-admin READS (FM-DOTNET sub-slice 1). More specific than the /api/:path* catch-all below, so
      // these must precede it. ONLY the four method-unambiguous GET paths are wired here. The GET readers for
      // /assessments/config and /assessments/schedule are also built + staged + tested, but their rewrites are
      // DEFERRED to the config/schedule WRITE slice: Next rewrites match by PATH not method, and those two
      // paths also serve a PUT write (still Node-only) — flipping them would route the PUT to .NET (no handler).
      // /results/:studentId/pca-status precedes the (deferred) rich /results/:studentId and does not shadow the
      // exact /results list source.
      ...(shouldRouteSchoolAdminReadsToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/evaluations/overview",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/evaluations/overview`,
            },
            // sub-slice 2: /results/export (literal) + /results/:studentId/pca-status MUST precede the
            // /results/:studentId report route below (Next matches in array order; same segment count for
            // export vs :studentId). All GET-only, so they cut over with the sub-slice-1 flag.
            {
              source: "/api/v1/school-admin/results/export",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/results/export`,
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
              source: "/api/v1/school-admin/results/:studentId",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/results/:studentId`,
            },
            {
              source: "/api/v1/school-admin/assessments/status",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/assessments/status`,
            },
            {
              source: "/api/v1/school-admin/assessments/pipeline",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/assessments/pipeline`,
            },
          ]
        : []),
      // FM-DOTNET Phase-B gradebook transcript read (GET-only; the grade writes stay Node). Its prefix
      // (/school-admin/gradebook/students) is disjoint from the /results and /assessments rewrites above, and
      // it must precede the /api/:path* catch-all below.
      ...(shouldRouteGradebookReadToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/gradebook/students/:studentId",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/gradebook/students/:studentId`,
            },
          ]
        : []),
      // School-admin CALENDAR reads + writes (FM-DOTNET-048) — the /calendar/* surface (3 GET reads + 9 writes)
      // flips together under ONE flag (path-not-method: the bare paths serve both GET and POST). The
      // /:id/set-current path precedes the /:id path (Next matches array order; both are :id-shaped so the more
      // specific 4-segment route must come first). All must precede the /api/:path* catch-all below.
      ...(shouldRouteSchoolAdminCalendarToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/calendar/academic-years",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/academic-years`,
            },
            {
              source: "/api/v1/school-admin/calendar/academic-years/:id/set-current",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/academic-years/:id/set-current`,
            },
            {
              source: "/api/v1/school-admin/calendar/academic-years/:id",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/academic-years/:id`,
            },
            {
              source: "/api/v1/school-admin/calendar/assessment-periods",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/assessment-periods`,
            },
            {
              source: "/api/v1/school-admin/calendar/assessment-periods/:id",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/assessment-periods/:id`,
            },
            {
              source: "/api/v1/school-admin/calendar/holidays",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/holidays`,
            },
            {
              source: "/api/v1/school-admin/calendar/holidays/:id",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/holidays/:id`,
            },
          ]
        : []),
      // School-admin ANALYTICS reads (FM-DOTNET-049) — four method-unambiguous GET paths under
      // /school-admin/analytics. Disjoint from the /results, /assessments and /gradebook rewrites; more specific
      // than the /api/:path* catch-all below, so these must precede it. /trends and /performance-trends hit the
      // same .NET backend (identical service call).
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
      // School:manage READS (FM-DOTNET-050) — the four method-unambiguous GET paths under /school-admin. Each is a
      // distinct literal (dashboard/stats, counselor-assignments/all, notes, counselor-workload), disjoint from the
      // /results, /assessments, /gradebook, /calendar and /analytics rewrites; more specific than the /api/:path*
      // catch-all below, so these must precede it. No write shares any of these paths (straight read cut-over).
      ...(shouldRouteSchoolReadsToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/dashboard/stats",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/dashboard/stats`,
            },
            {
              source: "/api/v1/school-admin/counselor-assignments/all",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/counselor-assignments/all`,
            },
            {
              source: "/api/v1/school-admin/notes",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/notes`,
            },
            {
              source: "/api/v1/school-admin/counselor-workload",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/counselor-workload`,
            },
          ]
        : []),
      // School:manage PROFILE + SETTINGS (FM-DOTNET-051) — /school/profile + /settings, each GET(read)+PUT(write)
      // flipping together under one flag (path-not-method). Both are distinct literals, disjoint from every other
      // school-admin rewrite block; more specific than the /api/:path* catch-all below, so they must precede it.
      ...(shouldRouteSchoolProfileSettingsToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/school/profile",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/school/profile`,
            },
            {
              source: "/api/v1/school-admin/settings",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/settings`,
            },
          ]
        : []),
      // School:users CLUSTER (FM-DOTNET-052) — /users (GET), /users/:userId/grade-level (PUT),
      // /counselors/:counselorId/assign-students (POST + DELETE, path-not-method), /counselors/:counselorId/students
      // (GET). Reads + writes flip together under one flag. All are distinct path shapes, disjoint from every other
      // school-admin rewrite block; more specific than the /api/:path* catch-all below, so they must precede it.
      ...(shouldRouteSchoolUsersToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/users",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/users`,
            },
            {
              source: "/api/v1/school-admin/users/:userId/grade-level",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/users/:userId/grade-level`,
            },
            {
              source: "/api/v1/school-admin/counselors/:counselorId/assign-students",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/counselors/:counselorId/assign-students`,
            },
            {
              source: "/api/v1/school-admin/counselors/:counselorId/students",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/counselors/:counselorId/students`,
            },
          ]
        : []),
      // iSAMS integration READS (FM-DOTNET-053) — /integrations/isams/status + /integrations/isams/jobs, both
      // method-unambiguous GETs (no write shares either path; a straight read cut-over, not dark). READS-ONLY: the
      // POST /integrations/isams (configure), /integrations/isams/sync and /integrations/isams/test paths are NOT
      // rewritten — they stay Node (vendor boundary). Both literals are disjoint from every other school-admin
      // rewrite block; more specific than the /api/:path* catch-all below, so they must precede it.
      ...(shouldRouteIsamsReadsToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/integrations/isams/status",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/integrations/isams/status`,
            },
            {
              source: "/api/v1/school-admin/integrations/isams/jobs",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/integrations/isams/jobs`,
            },
          ]
        : []),
      // School-courses GET + POST /courses (FM-DOTNET-054) — the EXACT literal /courses ONLY (GET+POST co-flip;
      // path-not-method). Does NOT match /courses/:courseId, /courses/pathways, /courses/import, /courses/ai-import
      // (all have a trailing segment) — those stay Node. More specific than the /api/:path* catch-all below, so it
      // must precede it. Default OFF (dark).
      ...(shouldRouteSchoolCoursesToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/courses",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/courses`,
            },
          ]
        : []),
      // Curriculum FRAMEWORKS (FM-DOTNET-055) — the four /curriculum/frameworks endpoints under /school-admin, all
      // gated by one flag (reads + writes flip together; /curriculum/frameworks serves GET and PUT). The three path
      // shapes have distinct segment counts, but the most-specific (…/:courseId) is listed first anyway. All disjoint
      // from /courses/* and every other school-admin block; more specific than the /api/:path* catch-all below.
      ...(shouldRouteCurriculumFrameworksToDotnet()
        ? [
            {
              source:
                "/api/v1/school-admin/curriculum/frameworks/:type/courses/:courseId",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/curriculum/frameworks/:type/courses/:courseId`,
            },
            {
              source: "/api/v1/school-admin/curriculum/frameworks/:type/courses",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/curriculum/frameworks/:type/courses`,
            },
            {
              source: "/api/v1/school-admin/curriculum/frameworks",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/curriculum/frameworks`,
            },
          ]
        : []),
      // Data-mappings (FM-DOTNET-056) — EXACTLY the two literal paths: /data-mappings (GET+POST co-flip) and
      // /data-mappings/bulk-approve (POST). Both exact literals → NO collision with the un-ported /data-mappings/:id
      // (PUT/DELETE) or /data-mappings/ai-suggest (Bedrock → Node); those fall through to the /api/:path* catch-all.
      // The more-specific bulk-approve literal is listed first (harmless — the two are disjoint literals). More
      // specific than the /api/:path* catch-all below, so both must precede it. Default OFF (dark).
      ...(shouldRouteDataMappingsToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/data-mappings/bulk-approve",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/data-mappings/bulk-approve`,
            },
            {
              source: "/api/v1/school-admin/data-mappings",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/data-mappings`,
            },
          ]
        : []),
      // Prerequisites (FM-DOTNET-057) — 5 paths. The two /courses/:courseId/* sub-paths are MORE specific than the
      // deferred bare /courses/:courseId (PUT/DELETE, still Node) → no collision. The /prerequisites/* trio is disjoint
      // from every other route. All more specific than the /api/:path* catch-all below, so all must precede it. Dark.
      ...(shouldRoutePrerequisitesToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/courses/:courseId/prerequisite-chain",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/courses/:courseId/prerequisite-chain`,
            },
            {
              source: "/api/v1/school-admin/courses/:courseId/prerequisites",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/courses/:courseId/prerequisites`,
            },
            {
              source: "/api/v1/school-admin/prerequisites/check/:studentId/:courseId",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/prerequisites/check/:studentId/:courseId`,
            },
            {
              source: "/api/v1/school-admin/prerequisites/eligible/:studentId",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/prerequisites/eligible/:studentId`,
            },
            {
              source: "/api/v1/school-admin/prerequisites/missing/:studentId/:courseId",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/prerequisites/missing/:studentId/:courseId`,
            },
          ]
        : []),
      // Derived pathways (FM-DOTNET-058) — GET /courses/pathways. Literal "pathways" segment is more specific than the
      // deferred bare /courses/:courseId (still Node) and disjoint from the FM-054 exact /courses → collision-free.
      // More specific than the /api/:path* catch-all below, so it must precede it. Dark.
      ...(shouldRoutePathwaysToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/courses/pathways",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/courses/pathways`,
            },
          ]
        : []),
      // School-admin CONFIG + SCHEDULE (FM-DOTNET-044) — /assessments/config + /assessments/schedule, each
      // GET(read, FM-039) + PUT(write, FM-044) flipping together under one flag (path-not-method). Same .NET
      // backend; both paths are 3-segment literals so no ordering hazard vs the reads routes above.
      ...(shouldRouteSchoolAdminConfigScheduleToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/assessments/config",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/assessments/config`,
            },
            {
              source: "/api/v1/school-admin/assessments/schedule",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/assessments/schedule`,
            },
          ]
        : []),
      // School-admin EMAIL writes (FM-DOTNET-045) — POST /assessments/send-reminders + /assessments/setup-360
      // (SES reminder emails / eval-group bulk-create + invites). POST-only, one flag, default off (dark).
      ...(shouldRouteSchoolAdminEmailWritesToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/assessments/send-reminders",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/assessments/send-reminders`,
            },
            {
              source: "/api/v1/school-admin/assessments/setup-360",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/assessments/setup-360`,
            },
          ]
        : []),
      // question360 (FM-DOTNET question360) — the WHOLE surface (5 reads + 6 writes) under ONE flag; reads +
      // writes cut over together (path-not-method: /:id can't split GET from PUT/DELETE). All literal + 2-segment
      // routes MUST precede the /:id catch-all (Next matches in array order) so /GetQuestions, /all, /bulk-create,
      // /:id/activate, etc. are not swallowed by :id. All hit the same .NET backend.
      ...(shouldRouteQuestion360ToDotnet()
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
              source: "/api/question360/bulk-create",
              destination: `${dotnetApiBaseUrl}/api/question360/bulk-create`,
            },
            {
              source: "/api/question360/:id/activate",
              destination: `${dotnetApiBaseUrl}/api/question360/:id/activate`,
            },
            {
              source: "/api/question360/:id/deactivate",
              destination: `${dotnetApiBaseUrl}/api/question360/:id/deactivate`,
            },
            {
              source: "/api/question360",
              destination: `${dotnetApiBaseUrl}/api/question360`,
            },
            {
              source: "/api/question360/:id",
              destination: `${dotnetApiBaseUrl}/api/question360/:id`,
            },
          ]
        : []),
      // FM-DOTNET capstone — token-gated external write rail. These /evaluation/* paths MUST precede the
      // /evaluation/:path* legacy catch-all below. Vocational tree first: literal /submit precedes /:token (a
      // token could otherwise be "submit"; the destination path is identical so .NET method-routes correctly
      // either way, but literal-first keeps intent explicit). /:token/violations is 2-segment (no shadow).
      ...(shouldRouteVocationalTakeToDotnet()
        ? [
            {
              source: "/evaluation/vocational/submit",
              destination: `${dotnetApiBaseUrl}/evaluation/vocational/submit`,
            },
            {
              source: "/evaluation/vocational/:token/violations",
              destination: `${dotnetApiBaseUrl}/evaluation/vocational/:token/violations`,
            },
            {
              source: "/evaluation/vocational/:token",
              destination: `${dotnetApiBaseUrl}/evaluation/vocational/:token`,
            },
          ]
        : []),
      // External 360 tree. validate-token + submit-feedback are literals; 360evolutor/:token is a distinct
      // literal-prefixed segment. All precede the /evaluation/:path* catch-all and the /evaluation/vocational
      // rewrites above are more specific, so no collision.
      ...(shouldRouteEvalExternalToDotnet()
        ? [
            {
              source: "/evaluation/validate-token",
              destination: `${dotnetApiBaseUrl}/evaluation/validate-token`,
            },
            {
              source: "/evaluation/submit-feedback",
              destination: `${dotnetApiBaseUrl}/evaluation/submit-feedback`,
            },
            {
              source: "/evaluation/360evolutor/:token",
              destination: `${dotnetApiBaseUrl}/evaluation/360evolutor/:token`,
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
