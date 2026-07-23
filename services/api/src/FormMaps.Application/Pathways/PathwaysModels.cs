namespace FormMaps.Application.Pathways;

/// <summary>
/// Models for the school-courses DERIVED PATHWAYS slice (FM-DOTNET-058 — routes/school-courses.ts, mounted under
/// /api/v1/school-admin; service schoolCoursesService.ts <c>computePathways</c>). ONE endpoint under one flag
/// FORMMAPS_ROUTE_PATHWAYS_TO_DOTNET: GET /courses/pathways (curriculum:manage). A read-only derivation — a "sequence"
/// is a maximal chain in the transitively-reduced prerequisite DAG. Pure once the active catalog rows are loaded.
/// </summary>

/// <summary>The projection <c>computePathways</c> selects from school_courses (WHERE schoolId, isActive=true,
/// status='active' ORDER BY code ASC). Only these six columns feed the derivation.</summary>
public sealed record PathwayCourseRow(
    string Id,
    string Code,
    string Name,
    string Department,
    IReadOnlyList<string> Prerequisites,
    bool IsHonors);

/// <summary>One node in an emitted chain — the wire shape { courseId, code, name, isHonors }.</summary>
public sealed record PathwayNode(string CourseId, string Code, string Name, bool IsHonors);

/// <summary>A department group — { department, chains } where each chain is a root→leaf course list (length ≥ 2).
/// department is the (verbatim) department of the chain's FIRST course, or "General" if it cannot be resolved.</summary>
public sealed record PathwayGroup(string Department, IReadOnlyList<IReadOnlyList<PathwayNode>> Chains);

/// <summary>computePathways result — { truncated, groups }. truncated=true when the MAX_CHAINS (200) or
/// MAX_CHAIN_LEN (12) caps cut the traversal short.</summary>
public sealed record PathwaysResult(bool Truncated, IReadOnlyList<PathwayGroup> Groups);
