namespace FormMaps.Application.Graduation;

// =============================================================================
// GET /graduation/rules — the rule-set tree, full Prisma passthrough
// =============================================================================

/// <summary>
/// A <c>graduation_rule_sets</c> row with its two included relations, exactly as
/// <c>schoolGradesService.getGraduationRules</c> returns it. <c>TotalCreditsRequired</c> is a STRING: the column
/// is DECIMAL(65,30) and nothing on this route coerces it, so it reaches the client as a decimal.js string.
/// Same for every Decimal below. See FormMaps.Infrastructure.Data.PrismaDecimalText.
/// </summary>
public sealed record GraduationRuleSetRow(
    string Id,
    string SchoolId,
    string AcademicYearId,
    string TotalCreditsRequired,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt,
    IReadOnlyList<CategoryRequirementRow> CategoryRequirements,
    IReadOnlyList<SpecialRequirementRow> SpecialRequirements);

public sealed record CategoryRequirementRow(
    string Id,
    string RuleSetId,
    string Category,
    string MinCredits,
    IReadOnlyList<string> RequiredCourses,
    bool ElectivesAllowed,
    int SortOrder,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

public sealed record SpecialRequirementRow(
    string Id,
    string RuleSetId,
    string Name,
    string Type,
    string Value,
    string? Unit,
    string? Description,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

// =============================================================================
// POST / PUT /graduation/rules — validated inputs
// =============================================================================

public sealed record CategoryRequirementInput(
    string Category,
    double MinCredits,
    IReadOnlyList<string> RequiredCourses,
    bool ElectivesAllowed);

public sealed record SpecialRequirementInput(
    string Name,
    string Type,
    double Value,
    string? Unit,
    string? Description);

/// <summary>Body of POST /graduation/rules. Absent child arrays mean "create none" (legacy <c>|| []</c>).</summary>
public sealed record CreateGraduationRulesInput(
    string? AcademicYearId,
    double TotalCreditsRequired,
    IReadOnlyList<CategoryRequirementInput> CategoryRequirements,
    IReadOnlyList<SpecialRequirementInput> SpecialRequirements);

/// <summary>
/// Body of PUT /graduation/rules/:ruleSetId. A NULL child list means the key was absent or not an array, which
/// legacy treats as "leave the existing rows alone"; an EMPTY list means "delete them all and create nothing".
/// That difference is the whole point of the nullable — collapsing it would silently wipe a rule set.
/// </summary>
public sealed record UpdateGraduationRulesInput(
    double? TotalCreditsRequired,
    IReadOnlyList<CategoryRequirementInput>? CategoryRequirements,
    IReadOnlyList<SpecialRequirementInput>? SpecialRequirements);

// =============================================================================
// GET /graduation/progress
// =============================================================================

public sealed record GraduationProgressListRow(
    string StudentId,
    string StudentName,
    int? GradeLevel,
    double CreditsCompleted,
    double CreditsRequired,
    int ProgressPercent,
    string Status);

public sealed record GraduationProgressPage(
    IReadOnlyList<GraduationProgressListRow> Data,
    int Total,
    int Page,
    int Limit,
    int TotalPages);

// =============================================================================
// GET /graduation/progress/:studentId — THREE response shapes, not one
// =============================================================================

public enum GraduationProgressOutcome
{
    /// <summary>Student missing or in another school -> 404 "Student not found".</summary>
    NotFound,

    /// <summary>200 with only { studentId, message } — no current academic year, or no active rule set.</summary>
    Message,

    Ok,
}

public sealed record StudentGraduationProgress(
    GraduationProgressOutcome Outcome,
    string? StudentId,
    string? Message,
    string? StudentName,
    string? RuleSetId,
    double TotalCreditsEarned,
    double TotalCreditsRequired,
    double OverallProgress,
    bool OnTrack,
    IReadOnlyList<CategoryProgress> CategoryProgress,
    IReadOnlyList<SpecialRequirementProgress> SpecialRequirementProgress);

public sealed record CategoryProgress(string Category, double Earned, double Required, double Progress, bool Met);

public sealed record SpecialRequirementProgress(
    string Id, string Name, string Type, double Required, string? Unit, bool Completed, string Note);

// =============================================================================
// GET /graduation/gap-analysis/:studentId
// =============================================================================

public enum GapAnalysisOutcome
{
    /// <summary>Student missing or in another school -> 404 "Student not found".</summary>
    NotFound,

    /// <summary>200 with only { studentId, gaps: [], recommendations: [] } — no year, or no rule set.
    /// Note the ABSENCE of studentName / ruleSetId / summary in this branch; it is not the Ok shape.</summary>
    Empty,

    Ok,
}

public sealed record GapAnalysis(
    GapAnalysisOutcome Outcome,
    string? StudentId,
    string? StudentName,
    string? RuleSetId,
    IReadOnlyList<CategoryGap> Gaps,
    IReadOnlyList<GapRecommendation> Recommendations,
    string? Summary);

public sealed record CategoryGap(string Category, double Earned, double Required, double Needed, string Severity);

public sealed record GapRecommendation(string Category, double Needed, IReadOnlyList<SuggestedCourse> SuggestedCourses);

public sealed record SuggestedCourse(string Id, string Code, string Name, double Credits, string? Department);
