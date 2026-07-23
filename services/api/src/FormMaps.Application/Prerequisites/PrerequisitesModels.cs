namespace FormMaps.Application.Prerequisites;

/// <summary>
/// Models for the school-courses PREREQUISITES slice (FM-DOTNET-057 — routes/school-courses.ts, mounted under
/// /api/v1/school-admin; service schoolCoursesService.ts getPrerequisiteChain / updatePrerequisites / resolveCourse /
/// checkEligibility / computeEligibilityMap). Five endpoints under one flag FORMMAPS_ROUTE_PREREQUISITES_TO_DOTNET:
/// GET /courses/:courseId/prerequisite-chain (courses:read), PUT /courses/:courseId/prerequisites (courses:write),
/// and GET /prerequisites/{check/:studentId/:courseId, eligible/:studentId, missing/:studentId/:courseId}
/// (curriculum:manage). credits raw Prisma Decimal → JSON STRING via trim_scale("credits")::text (decimal.js parity).
/// </summary>

/// <summary>The three-way outcome for a student+course lookup: student missing → 404 "Student not found",
/// course missing → 404 "Course not found", else the eligibility payload.</summary>
public enum PrerequisiteLookupOutcome
{
    Ok,
    StudentNotFound,
    CourseNotFound,
}

/// <summary>A single missing-prerequisite entry — { code, name }. name is "Not in catalog" for an unresolved code,
/// else the resolved course name.</summary>
public sealed record MissingPrerequisite(string Code, string Name);

/// <summary>
/// One prerequisite-chain entry (getPrerequisiteChain). <see cref="Credits"/> is HETEROGENEOUS to match legacy: a
/// resolved (in-catalog) prereq emits the raw Prisma Decimal as a JSON STRING (trim_scale::text — boxed string here);
/// an unresolved code emits the JSON NUMBER 0 (boxed int here). System.Text.Json serializes the boxed value by its
/// runtime type, reproducing the mixed string/number shape exactly.
/// </summary>
public sealed record PrerequisiteChainEntry(
    string Code,
    string Name,
    string Department,
    object Credits,
    int Depth,
    string? FrameworkType,
    bool IsHonors);

/// <summary>getPrerequisiteChain result. chain is depth-DESC (STABLE — ties keep BFS insertion order). totalDepth =
/// max depth or 0. Null (not this record) is returned by the reader for the 404 (course missing / wrong school).</summary>
public sealed record PrerequisiteChainResult(
    string CourseId,
    string CourseCode,
    IReadOnlyList<PrerequisiteChainEntry> Chain,
    int TotalDepth);

/// <summary>
/// checkEligibility result (serves BOTH /prerequisites/check and /prerequisites/missing — the endpoints shape the
/// response; check includes <see cref="Eligible"/>, missing omits it). On a 404 the <see cref="Outcome"/> is
/// StudentNotFound / CourseNotFound and the payload fields are unset.
/// </summary>
public sealed record EligibilityResult(
    PrerequisiteLookupOutcome Outcome,
    string StudentId,
    string CourseId,
    string CourseCode,
    string CourseName,
    bool Eligible,
    IReadOnlyList<string> Errors,
    IReadOnlyList<MissingPrerequisite> Missing)
{
    public static EligibilityResult StudentNotFound() =>
        new(PrerequisiteLookupOutcome.StudentNotFound, "", "", "", "", false, [], []);

    public static EligibilityResult CourseNotFound() =>
        new(PrerequisiteLookupOutcome.CourseNotFound, "", "", "", "", false, [], []);
}

/// <summary>One computeEligibilityMap ENUMERATION entry (an active+status='active' course) after eligibility. The
/// eligible-endpoint handler filters on <see cref="Eligible"/> + gradeLevel/department, then projects
/// { id, code, name, department, credits, gradeLevels }. credits = trim_scale STRING.</summary>
public sealed record EligibleCandidate(
    string CourseId,
    string CourseCode,
    string CourseName,
    string Department,
    string Credits,
    IReadOnlyList<int> GradeLevels,
    bool Eligible);

/// <summary>computeEligibilityMap result — StudentNotFound → 404, else the full enumeration set (unfiltered; the
/// handler applies the eligible + gradeLevel + department filters).</summary>
public sealed record EligibleMapResult(
    PrerequisiteLookupOutcome Outcome,
    IReadOnlyList<EligibleCandidate> Candidates)
{
    public static EligibleMapResult StudentNotFound() => new(PrerequisiteLookupOutcome.StudentNotFound, []);
}
