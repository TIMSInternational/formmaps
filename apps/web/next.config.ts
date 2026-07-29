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

// ── Calendar writes (FM-DOTNET-047/048): academic-years/assessment-periods/holidays ──
// All 12 calendar endpoints cut over as a write-coupled slice; blue-canary write-verified in prod.
function shouldRouteCalendarToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_ADMIN_CALENDAR_TO_DOTNET));
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

// Vocational recompute WRITES (FM-DOTNET-032/036): authenticate-only + canAccessUser, no
// permission-gate tier. Two independent flags (score vs. integrated), each its own POST-only
// path, default OFF.
function shouldRouteVocationalScoreRecomputeToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VOCATIONAL_SCORE_RECOMPUTE_TO_DOTNET));
}
function shouldRouteVocationalIntegratedRecomputeToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VOCATIONAL_INTEGRATED_RECOMPUTE_TO_DOTNET));
}

// ── School-manage-reads (FM-DOTNET-050): dashboard/stats, counselor-assignments/all, notes,
// counselor-workload. The 4 GET-only paths with no write sharing their path. FM-051
// (school/profile+settings) and FM-052 (users+counselor-assign) are DELIBERATELY excluded —
// both co-flip a GET and a PUT/POST/DELETE on the identical literal path (path-not-method),
// same trap as the calendar slice; not safe to cut over as reads-only.
function shouldRouteSchoolReadsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_READS_TO_DOTNET));
}

// ── School profile + settings (FM-DOTNET-051): GET+PUT /school/profile, GET+PUT /settings. Both
// paths co-flip a read and a write on the identical literal path (path-not-method) — write-coupled,
// like calendar. gate = school:manage permission.
function shouldRouteSchoolProfileToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_PROFILE_TO_DOTNET));
}

// ── School users cluster (FM-DOTNET-052): GET /users, PUT /users/:userId/grade-level,
// POST+DELETE /counselors/:counselorId/assign-students, GET /counselors/:counselorId/students.
// ONE flag co-flips all 5 (path-not-method on 2 of the 3 sub-paths). gate = school:users permission.
function shouldRouteSchoolUsersToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_USERS_TO_DOTNET));
}

// ── iSAMS integration reads (FM-DOTNET-053): /status + /jobs, no write sharing either path.
// The POST configure/sync/test paths stay Node (vendor boundary, SSRF-hardened undici client) —
// not part of this cutover.
function shouldRouteIsamsReadsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_ISAMS_READS_TO_DOTNET));
}

// ── Course catalog CRUD (FM-DOTNET-054 GET+POST /courses, FM-DOTNET-061 PUT+DELETE
// /courses/:courseId) — ONE flag gates all 4. Next.js rewrites match by PATH not method, so the
// exact-literal /courses source co-flips GET+POST together, and the :courseId param source
// co-flips PUT+DELETE together — deliberate (FM-061 completed FM-054's originally-deferred
// PUT/DELETE under the SAME flag). The negative lookahead on :courseId excludes
// /courses/pathways, /courses/import, /courses/ai-import and their sub-paths (courseIds are
// UUIDs, never equal to those literals — a safety belt, not a real collision risk). Distinct
// methods (PUT/DELETE) from the co-flipped literal's siblings (pathways/import are GET/POST) →
// no ASP.NET route-matching ambiguity on the .NET side. Default OFF (dark).
function shouldRouteSchoolCoursesToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_COURSES_TO_DOTNET));
}

// ── Course pathways (FM-DOTNET-058): GET /courses/pathways, the one TRUE pure read in the
// curriculum cluster. The other 4 cluster slices (frameworks, data-mappings, prerequisites,
// course-import) all co-flip reads+writes under one flag each — deliberately excluded here,
// same as calendar/FM-051/FM-052/FM-054, pending their own write-verification harnesses.
function shouldRoutePathwaysToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PATHWAYS_TO_DOTNET));
}

// ── Curriculum frameworks (FM-DOTNET-055): GET+PUT /curriculum/frameworks, GET .../:type/courses,
// PUT .../:type/courses/:courseId. All 4 co-flip under one flag (path-not-method on the first pair).
function shouldRouteCurriculumFrameworksToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_CURRICULUM_FRAMEWORKS_TO_DOTNET));
}

// ── Prerequisites (FM-DOTNET-057): GET /courses/:courseId/prerequisite-chain (courses:read),
// PUT /courses/:courseId/prerequisites (courses:write), GET /prerequisites/{check,eligible,missing}
// (curriculum:manage). One flag co-flips all 5. Data-mappings (FM-056) and course-import
// (FM-059/060) remain dark — the cluster's only delete + an unresolved canary-engine gap.
function shouldRoutePrerequisitesToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PREREQUISITES_TO_DOTNET));
}

// ── Data mappings (FM-DOTNET-056/061): GET+POST /data-mappings, POST /data-mappings/bulk-approve,
// PUT+DELETE /data-mappings/:id (negative lookahead excludes bulk-approve/ai-suggest). One flag,
// courses cluster's only real hard-delete. ai-suggest (Bedrock) stays Node.
function shouldRouteDataMappingsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_DATA_MAPPINGS_TO_DOTNET));
}

// ── Course import (FM-DOTNET-059/060): POST /courses/import, GET /courses/import/:jobId,
// GET /courses/import/:jobId/download-failures. One flag, all courses:write. Import is
// synchronous despite the 202 status — the job is already "completed" by the time POST returns.
function shouldRouteCourseImportToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_COURSE_IMPORT_TO_DOTNET));
}

// ── Counselor dashboard reads (FM-DOTNET-067) + enriched caseload (FM-DOTNET-068) — all GET-only,
// no write anywhere on any of these 5 paths. Counselor writes (availability/alerts/sessions/notes,
// FM-069-072) and student/parent CRUD (FM-073-078) deliberately excluded — write-coupled.
function shouldRouteCounselorDashboardToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_COUNSELOR_DASHBOARD_TO_DOTNET));
}
function shouldRouteCounselorCaseloadToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_COUNSELOR_CASELOAD_TO_DOTNET));
}
// ── Counselor notes CRUD (FM-DOTNET-072): GET+POST /students/:studentId/notes, PUT+DELETE
// /notes/:noteId, PUT /notes/:noteId/complete-followup — ONE flag co-flips all 5 (path-not-method).
// GET/POST/DELETE use a raw-role check (counselor/school_admin/Super Admin, no school-ownership
// check); PUT + complete-followup require permission counselor:notes (school_admin lacks it).
// Availability/alerts/sessions (FM-069-071) deliberately excluded — no safe round-trippable write
// path via the API alone (no create endpoint for alerts/sessions; availability is a singleton
// upsert with no delete). Default OFF (dark).
function shouldRouteCounselorNotesToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_COUNSELOR_NOTES_TO_DOTNET));
}
// ── Counselor availability (FM-DOTNET-069): GET+PUT /me/availability, one flag (path-not-method).
// Full-overwrite upsert — no merge, no delete. Cutover captures+restores the real row's fields.
function shouldRouteCounselorAvailabilityToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_COUNSELOR_AVAILABILITY_TO_DOTNET));
}
// ── Counselor alerts (FM-DOTNET-070): GET /me/alerts, PUT /me/alerts/:id/read. Two distinct
// paths under one flag. No create endpoint — mark-read is idempotent, seeded via Tier-2 SQL.
function shouldRouteCounselorAlertsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_COUNSELOR_ALERTS_TO_DOTNET));
}
// ── Counselor sessions (FM-DOTNET-071): GET /me/sessions, PUT /me/sessions/:id/complete. Two
// distinct paths under one flag. cancel stays Node (calendar-sync side effect).
function shouldRouteCounselorSessionsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_COUNSELOR_SESSIONS_TO_DOTNET));
}
// ── Parent child-link-scoped reads (FM-DOTNET-079) — GET progress + GET course-plan, both
// gated by an accepted+active StudentParentLink. Pure reads, no write on either path.
function shouldRouteParentChildReadsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PARENT_CHILD_READS_TO_DOTNET));
}

// ── Academic gaps reads (FM-DOTNET-080): summary/students/recommendations, all pure GETs.
// The 4th sibling route /ai-recommendations/:studentId (Bedrock) is a distinct literal segment
// and stays Node permanently by design — not part of this cutover.
function shouldRouteAcademicGapsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_ACADEMIC_GAPS_TO_DOTNET));
}

// ── Student portfolio CRUD (FM-DOTNET-073): GET+POST /portfolio, GET /portfolio/summary,
// PUT+DELETE /portfolio/:id — ONE flag co-flips all 5. /portfolio/summary MUST precede
// /portfolio/:id (the :id param would otherwise swallow "summary"). Self-scoped
// (req.userId) — no server-side permission gate on this endpoint at all, only identity.
// Default OFF (dark).
function shouldRouteStudentPortfolioToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_STUDENT_PORTFOLIO_TO_DOTNET));
}

// ── Student community-service CRUD (FM-DOTNET-075): GET+POST /community-service,
// PUT+DELETE /community-service/:id — ONE flag co-flips both paths (Next matches
// path-not-method). Self-scoped (req.userId) — no server-side permission gate at all,
// only identity. Edit/delete additionally gated on isActive + status=="pending" server-side.
// Default OFF (dark).
function shouldRouteCommunityServiceToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_STUDENT_COMMUNITY_SERVICE_TO_DOTNET));
}

// ── College applications CRUD (FM-DOTNET-081): GET+POST /college/students/:studentId/applications,
// PUT+DELETE /college/applications/:id — ONE flag co-flips both paths. Access via ICollegeAccessResolver
// (student self / counselor with active assignment / school_admin same-school / super admin) — any
// failure collapses to a uniform 404. Soft-delete. Default OFF (dark).
function shouldRouteCollegeApplicationsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_COLLEGE_APPLICATIONS_TO_DOTNET));
}

// ── College search + favorites (FM-DOTNET-082): GET /college/search (no access gate),
// GET+POST /college/students/:studentId/list, PUT+DELETE /college/list/:id — ONE flag
// co-flips all three paths. Favorites reuse ICollegeAccessResolver. Soft-delete. Default OFF.
function shouldRouteCollegeFavoritesToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_COLLEGE_FAVORITES_TO_DOTNET));
}

// ── College essays + comments (FM-DOTNET-083): GET+POST /college/students/:studentId/essays,
// PUT+DELETE /college/essays/:id, POST+GET /college/essays/:id/comments — ONE flag co-flips
// all three paths. Reuses ICollegeAccessResolver. Soft-delete on essays; comments have no delete.
// Default OFF.
function shouldRouteCollegeEssaysToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_COLLEGE_ESSAYS_TO_DOTNET));
}

// ── Student applications core CRUD (FM-DOTNET-074): GET+POST /student/applications,
// GET /student/applications/deadlines, GET+PUT+DELETE /student/applications/:id — ONE flag
// co-flips three paths (/applications/deadlines MUST precede /applications/:id). Self-scoped
// (RequireIdentity only). Soft-delete. Writes the same student_applications table as college.ts
// (FM-081), same as legacy Node's two independent route surfaces. Default OFF.
function shouldRouteStudentApplicationsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_STUDENT_APPLICATIONS_TO_DOTNET));
}

// ── Student parent-links CRUD (FM-DOTNET-076): GET /student/parents, POST /student/parents/invite,
// DELETE /student/parents/:parentLinkId, POST /student/parents/:parentLinkId/resend — ONE flag
// co-flips four paths (/parents/invite MUST precede /parents/:parentLinkId). Self-scoped. NOT
// SES-coupled (mints a token only, no email). Delete gate = ownership-only (no isActive check).
// Default OFF.
function shouldRouteStudentParentsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_STUDENT_PARENTS_TO_DOTNET));
}

// ── Student application essays + checklist (FM-DOTNET-077): GET+POST /student/applications/:id/essays,
// PUT /student/applications/:id/essays/:eid, GET+POST /student/applications/:id/checklist,
// PUT /student/applications/:id/checklist/:cid — ONE flag co-flips all four paths. Self-scoped +
// application-ownership check. Zero delete endpoints — no Tier-2 check needed. AI siblings
// (ai-review, checklist/generate) stay Node. Default OFF.
function shouldRouteStudentEssaysChecklistToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_STUDENT_ESSAYS_CHECKLIST_TO_DOTNET));
}

// ── Course-plan compute reads (FM-DOTNET-086): GET /student/course-plan/recommendations,
// GET /student/course-plan/eligibility — ONE flag co-flips both. Self-scoped, pure reads,
// no writes at all. Default OFF.
function shouldRouteStudentCoursePlanComputeToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_STUDENT_COURSE_PLAN_COMPUTE_TO_DOTNET));
}

// ── Parent portal (FM-DOTNET-078): GET /parent/profile, GET /parent/notifications,
// PUT /parent/notifications/read-all, PUT /parent/notifications/:id/read,
// GET /parent/evaluations/pending, DELETE /parent/:parentLinkId — ONE flag co-flips all six.
// Self-scoped (RequireIdentity, caller's own identity). :parentLinkId excludes the 6 sibling
// top-level /parent/* segments (profile/notifications/invite/onboarding/children/evaluations)
// so it never swallows them. invite/resend + onboarding + children reads stay Node. Default OFF.
function shouldRouteParentPortalToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_PARENT_PORTAL_TO_DOTNET));
}

// ── Course-plan CRUD (FM-DOTNET-084): GET /student/course-plan, POST /student/course-plan/courses,
// DELETE /student/course-plan/courses/:courseId — ONE flag co-flips all three. Self-scoped,
// gated on requireSchoolMembership + a current academic year. Hard delete (deleteMany).
// Default OFF.
function shouldRouteStudentCoursePlanToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_STUDENT_COURSE_PLAN_TO_DOTNET));
}

// ── Course change-requests CRUD (FM-DOTNET-085): POST+GET /student/course-plan/change-requests,
// DELETE /student/course-plan/change-requests/:requestId — ONE flag co-flips both paths.
// Self-scoped, gated on requireSchoolMembership only (no current-year gate). Soft-cancel
// (status=cancelled, only from pending). Default OFF.
function shouldRouteStudentChangeRequestsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_STUDENT_CHANGE_REQUESTS_TO_DOTNET));
}

// ── School-admin email writes (FM-DOTNET-045): POST /assessments/send-reminders
// (no DB write, fans out reminder emails) + POST /assessments/setup-360 (bulk-INSERT
// evaluation_groups then fires 360-eval invite emails). ONE flag, both paths distinct
// literals so no co-flip risk with the read-only /assessments/status. Emails are
// best-effort (IEmailSender never throws). Default OFF.
function shouldRouteSchoolAdminEmailWritesToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_ADMIN_EMAIL_WRITES_TO_DOTNET));
}

// School-admin CONFIG/SCHEDULE writes (FM-DOTNET-044): PUT /assessments/config + PUT /assessments/schedule.
// GET(read, FM-039) + PUT(write, FM-044) flip together under one flag (path-not-method). Default OFF.
function shouldRouteSchoolAdminConfigScheduleToDotnet() {
  return Boolean(
    dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SCHOOL_ADMIN_CONFIG_SCHEDULE_TO_DOTNET)
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
      // GET(read, FM-039) + PUT(write, FM-044) flipping together under one flag (path-not-method).
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
      ...(shouldRouteCalendarToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/calendar/academic-years",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/academic-years`,
            },
            {
              source: "/api/v1/school-admin/calendar/academic-years/:id",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/academic-years/:id`,
            },
            {
              source: "/api/v1/school-admin/calendar/academic-years/:id/set-current",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/calendar/academic-years/:id/set-current`,
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
      ...(shouldRouteSchoolProfileToDotnet()
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
      ...(shouldRouteSchoolCoursesToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/courses",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/courses`,
            },
            {
              source: "/api/v1/school-admin/courses/:courseId((?!import|pathways|ai-import)[^/]+)",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/courses/:courseId`,
            },
          ]
        : []),
      ...(shouldRoutePathwaysToDotnet()
        ? [{ source: "/api/v1/school-admin/courses/pathways", destination: `${dotnetApiBaseUrl}/api/v1/school-admin/courses/pathways` }]
        : []),
      ...(shouldRouteCurriculumFrameworksToDotnet()
        ? [
            { source: "/api/v1/school-admin/curriculum/frameworks", destination: `${dotnetApiBaseUrl}/api/v1/school-admin/curriculum/frameworks` },
            {
              source: "/api/v1/school-admin/curriculum/frameworks/:type/courses",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/curriculum/frameworks/:type/courses`,
            },
            {
              source: "/api/v1/school-admin/curriculum/frameworks/:type/courses/:courseId",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/curriculum/frameworks/:type/courses/:courseId`,
            },
          ]
        : []),
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
      ...(shouldRouteDataMappingsToDotnet()
        ? [
            { source: "/api/v1/school-admin/data-mappings", destination: `${dotnetApiBaseUrl}/api/v1/school-admin/data-mappings` },
            {
              source: "/api/v1/school-admin/data-mappings/bulk-approve",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/data-mappings/bulk-approve`,
            },
            {
              source: "/api/v1/school-admin/data-mappings/:id((?!bulk-approve|ai-suggest)[^/]+)",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/data-mappings/:id`,
            },
          ]
        : []),
      ...(shouldRouteCourseImportToDotnet()
        ? [
            { source: "/api/v1/school-admin/courses/import", destination: `${dotnetApiBaseUrl}/api/v1/school-admin/courses/import` },
            {
              source: "/api/v1/school-admin/courses/import/:jobId((?!download-failures)[^/]+)",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/courses/import/:jobId`,
            },
            {
              source: "/api/v1/school-admin/courses/import/:jobId/download-failures",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/courses/import/:jobId/download-failures`,
            },
          ]
        : []),
      ...(shouldRouteCounselorDashboardToDotnet()
        ? [
            { source: "/api/v1/counselor/dashboard/change-requests", destination: `${dotnetApiBaseUrl}/api/v1/counselor/dashboard/change-requests` },
            { source: "/api/v1/counselor/dashboard", destination: `${dotnetApiBaseUrl}/api/v1/counselor/dashboard` },
            { source: "/api/v1/counselor/me/students/:studentId", destination: `${dotnetApiBaseUrl}/api/v1/counselor/me/students/:studentId` },
            { source: "/api/v1/counselor/students/:studentId", destination: `${dotnetApiBaseUrl}/api/v1/counselor/students/:studentId` },
          ]
        : []),
      ...(shouldRouteCounselorCaseloadToDotnet()
        ? [{ source: "/api/v1/counselor/me/students", destination: `${dotnetApiBaseUrl}/api/v1/counselor/me/students` }]
        : []),
      ...(shouldRouteCounselorNotesToDotnet()
        ? [
            { source: "/api/v1/counselor/students/:studentId/notes", destination: `${dotnetApiBaseUrl}/api/v1/counselor/students/:studentId/notes` },
            { source: "/api/v1/counselor/notes/:noteId", destination: `${dotnetApiBaseUrl}/api/v1/counselor/notes/:noteId` },
            { source: "/api/v1/counselor/notes/:noteId/complete-followup", destination: `${dotnetApiBaseUrl}/api/v1/counselor/notes/:noteId/complete-followup` },
          ]
        : []),
      ...(shouldRouteCounselorAvailabilityToDotnet()
        ? [{ source: "/api/v1/counselor/me/availability", destination: `${dotnetApiBaseUrl}/api/v1/counselor/me/availability` }]
        : []),
      ...(shouldRouteCounselorAlertsToDotnet()
        ? [
            { source: "/api/v1/counselor/me/alerts", destination: `${dotnetApiBaseUrl}/api/v1/counselor/me/alerts` },
            { source: "/api/v1/counselor/me/alerts/:id/read", destination: `${dotnetApiBaseUrl}/api/v1/counselor/me/alerts/:id/read` },
          ]
        : []),
      ...(shouldRouteCounselorSessionsToDotnet()
        ? [
            { source: "/api/v1/counselor/me/sessions", destination: `${dotnetApiBaseUrl}/api/v1/counselor/me/sessions` },
            { source: "/api/v1/counselor/me/sessions/:id/complete", destination: `${dotnetApiBaseUrl}/api/v1/counselor/me/sessions/:id/complete` },
          ]
        : []),
      ...(shouldRouteParentChildReadsToDotnet()
        ? [
            { source: "/api/v1/parent/children/:studentId/progress", destination: `${dotnetApiBaseUrl}/api/v1/parent/children/:studentId/progress` },
            { source: "/api/v1/parent/children/:studentId/course-plan", destination: `${dotnetApiBaseUrl}/api/v1/parent/children/:studentId/course-plan` },
          ]
        : []),
      ...(shouldRouteAcademicGapsToDotnet()
        ? [
            {
              source: "/api/v1/school-admin/academic-gaps/summary",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/academic-gaps/summary`,
            },
            {
              source: "/api/v1/school-admin/academic-gaps/students/:studentId",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/academic-gaps/students/:studentId`,
            },
            {
              source: "/api/v1/school-admin/academic-gaps/recommendations/:studentId",
              destination: `${dotnetApiBaseUrl}/api/v1/school-admin/academic-gaps/recommendations/:studentId`,
            },
          ]
        : []),
      ...(shouldRouteStudentPortfolioToDotnet()
        ? [
            { source: "/api/v1/student/portfolio", destination: `${dotnetApiBaseUrl}/api/v1/student/portfolio` },
            { source: "/api/v1/student/portfolio/summary", destination: `${dotnetApiBaseUrl}/api/v1/student/portfolio/summary` },
            { source: "/api/v1/student/portfolio/:id", destination: `${dotnetApiBaseUrl}/api/v1/student/portfolio/:id` },
          ]
        : []),
      ...(shouldRouteCommunityServiceToDotnet()
        ? [
            { source: "/api/v1/student/community-service", destination: `${dotnetApiBaseUrl}/api/v1/student/community-service` },
            { source: "/api/v1/student/community-service/:id", destination: `${dotnetApiBaseUrl}/api/v1/student/community-service/:id` },
          ]
        : []),
      ...(shouldRouteCollegeApplicationsToDotnet()
        ? [
            { source: "/api/v1/college/students/:studentId/applications", destination: `${dotnetApiBaseUrl}/api/v1/college/students/:studentId/applications` },
            { source: "/api/v1/college/applications/:id", destination: `${dotnetApiBaseUrl}/api/v1/college/applications/:id` },
          ]
        : []),
      ...(shouldRouteCollegeFavoritesToDotnet()
        ? [
            { source: "/api/v1/college/search", destination: `${dotnetApiBaseUrl}/api/v1/college/search` },
            { source: "/api/v1/college/students/:studentId/list", destination: `${dotnetApiBaseUrl}/api/v1/college/students/:studentId/list` },
            { source: "/api/v1/college/list/:id", destination: `${dotnetApiBaseUrl}/api/v1/college/list/:id` },
          ]
        : []),
      ...(shouldRouteCollegeEssaysToDotnet()
        ? [
            { source: "/api/v1/college/students/:studentId/essays", destination: `${dotnetApiBaseUrl}/api/v1/college/students/:studentId/essays` },
            { source: "/api/v1/college/essays/:id", destination: `${dotnetApiBaseUrl}/api/v1/college/essays/:id` },
            { source: "/api/v1/college/essays/:id/comments", destination: `${dotnetApiBaseUrl}/api/v1/college/essays/:id/comments` },
          ]
        : []),
      ...(shouldRouteStudentApplicationsToDotnet()
        ? [
            { source: "/api/v1/student/applications/deadlines", destination: `${dotnetApiBaseUrl}/api/v1/student/applications/deadlines` },
            { source: "/api/v1/student/applications", destination: `${dotnetApiBaseUrl}/api/v1/student/applications` },
            { source: "/api/v1/student/applications/:id", destination: `${dotnetApiBaseUrl}/api/v1/student/applications/:id` },
          ]
        : []),
      ...(shouldRouteStudentParentsToDotnet()
        ? [
            { source: "/api/v1/student/parents/invite", destination: `${dotnetApiBaseUrl}/api/v1/student/parents/invite` },
            { source: "/api/v1/student/parents", destination: `${dotnetApiBaseUrl}/api/v1/student/parents` },
            { source: "/api/v1/student/parents/:parentLinkId", destination: `${dotnetApiBaseUrl}/api/v1/student/parents/:parentLinkId` },
            { source: "/api/v1/student/parents/:parentLinkId/resend", destination: `${dotnetApiBaseUrl}/api/v1/student/parents/:parentLinkId/resend` },
          ]
        : []),
      ...(shouldRouteStudentEssaysChecklistToDotnet()
        ? [
            { source: "/api/v1/student/applications/:id/essays", destination: `${dotnetApiBaseUrl}/api/v1/student/applications/:id/essays` },
            { source: "/api/v1/student/applications/:id/essays/:eid", destination: `${dotnetApiBaseUrl}/api/v1/student/applications/:id/essays/:eid` },
            { source: "/api/v1/student/applications/:id/checklist", destination: `${dotnetApiBaseUrl}/api/v1/student/applications/:id/checklist` },
            { source: "/api/v1/student/applications/:id/checklist/:cid", destination: `${dotnetApiBaseUrl}/api/v1/student/applications/:id/checklist/:cid` },
          ]
        : []),
      ...(shouldRouteStudentCoursePlanComputeToDotnet()
        ? [
            { source: "/api/v1/student/course-plan/recommendations", destination: `${dotnetApiBaseUrl}/api/v1/student/course-plan/recommendations` },
            { source: "/api/v1/student/course-plan/eligibility", destination: `${dotnetApiBaseUrl}/api/v1/student/course-plan/eligibility` },
          ]
        : []),
      ...(shouldRouteParentPortalToDotnet()
        ? [
            { source: "/api/v1/parent/profile", destination: `${dotnetApiBaseUrl}/api/v1/parent/profile` },
            { source: "/api/v1/parent/notifications", destination: `${dotnetApiBaseUrl}/api/v1/parent/notifications` },
            { source: "/api/v1/parent/notifications/read-all", destination: `${dotnetApiBaseUrl}/api/v1/parent/notifications/read-all` },
            { source: "/api/v1/parent/notifications/:id/read", destination: `${dotnetApiBaseUrl}/api/v1/parent/notifications/:id/read` },
            { source: "/api/v1/parent/evaluations/pending", destination: `${dotnetApiBaseUrl}/api/v1/parent/evaluations/pending` },
            { source: "/api/v1/parent/:parentLinkId((?!profile|notifications|invite|onboarding|children|evaluations)[^/]+)", destination: `${dotnetApiBaseUrl}/api/v1/parent/:parentLinkId` },
          ]
        : []),
      ...(shouldRouteStudentCoursePlanToDotnet()
        ? [
            { source: "/api/v1/student/course-plan", destination: `${dotnetApiBaseUrl}/api/v1/student/course-plan` },
            { source: "/api/v1/student/course-plan/courses", destination: `${dotnetApiBaseUrl}/api/v1/student/course-plan/courses` },
            { source: "/api/v1/student/course-plan/courses/:courseId", destination: `${dotnetApiBaseUrl}/api/v1/student/course-plan/courses/:courseId` },
          ]
        : []),
      ...(shouldRouteStudentChangeRequestsToDotnet()
        ? [
            { source: "/api/v1/student/course-plan/change-requests", destination: `${dotnetApiBaseUrl}/api/v1/student/course-plan/change-requests` },
            { source: "/api/v1/student/course-plan/change-requests/:requestId", destination: `${dotnetApiBaseUrl}/api/v1/student/course-plan/change-requests/:requestId` },
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
