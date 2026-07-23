using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.StudentPortfolio;

/// <summary>
/// Student portfolio CRUD (FM-DOTNET-073 — routes/student.ts + studentService.ts). Self-scoped (req.userId): list +
/// summary reads, create/update/soft-delete writes, all keyed on the caller's own studentId under RLS. Zod-validated
/// bodies (createPortfolioSchema / updatePortfolioSchema.partial()); create applies JS-|| defaults, update applies the
/// per-field <c>bounded()</c> string slice. hoursPerWeek/totalHours are Decimal columns → emitted verbatim as strings
/// on the row but summed numerically in the summary.
/// </summary>
public interface IStudentPortfolioRepository
{
    /// <summary>The caller's active items (paged, optional type filter) + real COUNT.</summary>
    Task<PortfolioPage> ListAsync(
        RequestContext context, string studentId, string? type, int page, int limit,
        CancellationToken cancellationToken = default);

    /// <summary>Aggregate over the caller's active items (counts by type, hours, skills, categories).</summary>
    Task<PortfolioSummary> GetSummaryAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>Create an item (create-time || defaults already resolved by the caller). Returns the created row.</summary>
    Task<PortfolioRow> CreateAsync(
        RequestContext context, string studentId, PortfolioInput input, CancellationToken cancellationToken = default);

    /// <summary>Partial update of the caller's own item. Null = missing OR not owned (→ 404 "Item not found"); the
    /// per-field bounded() slice is applied here. Returns the updated row.</summary>
    Task<PortfolioRow?> UpdateAsync(
        RequestContext context, string studentId, string itemId, PortfolioInput input,
        CancellationToken cancellationToken = default);

    /// <summary>Soft-delete (isActive=false). False = missing OR not owned (→ 404); true otherwise.</summary>
    Task<bool> SoftDeleteAsync(
        RequestContext context, string studentId, string itemId, CancellationToken cancellationToken = default);
}

/// <summary>A page of portfolio rows + the (filter-scoped) real COUNT total.</summary>
public sealed record PortfolioPage(IReadOnlyList<PortfolioRow> Data, int Total);

/// <summary>
/// getPortfolioSummary output: totalItems, byType (count per type — insertion order), totalHoursPerWeek (sum of
/// non-null hoursPerWeek as Number), totalVolunteerHours (sum of non-null totalHours where type=="volunteer"),
/// skills (union, first-seen order), categories (distinct type count = byType.size).
/// </summary>
public sealed record PortfolioSummary(
    int TotalItems,
    IReadOnlyDictionary<string, int> ByType,
    double TotalHoursPerWeek,
    double TotalVolunteerHours,
    IReadOnlyList<string> Skills,
    int Categories);

/// <summary>
/// A student_portfolio_items row as legacy emits it (raw Prisma passthrough, schema field order). hoursPerWeek /
/// totalHours are Decimal → verbatim string (or null); attachments is verbatim jsonb; achievements/skills are text[];
/// activityCategory is the enum text (default "other"); weeksPerYear is a nullable int; timestamps are ISO-Z.
/// </summary>
public sealed record PortfolioRow(
    string Id,
    string StudentId,
    string Type,
    string Title,
    string? Organization,
    string? StartDate,
    string? EndDate,
    bool IsCurrent,
    string? Description,
    string? Role,
    string? HoursPerWeek,
    string? TotalHours,
    string[] Achievements,
    string[] Skills,
    JsonElement Attachments,
    string ActivityCategory,
    int? WeeksPerYear,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>
/// The Zod-validated write body (presence-aware). Only present keys are written; on create the caller resolves the
/// JS-|| defaults (type→"activity", isCurrent→false, achievements/skills→[]); on update the repo applies bounded().
/// hoursPerWeek/totalHours are decimals; weeksPerYear an int; achievements/skills string[]; the rest strings/bool.
/// </summary>
public sealed record PortfolioInput(
    bool HasType, string? Type,
    bool HasTitle, string? Title,
    bool HasOrganization, string? Organization,
    bool HasStartDate, string? StartDate,
    bool HasEndDate, string? EndDate,
    bool HasIsCurrent, bool IsCurrent,
    bool HasDescription, string? Description,
    bool HasRole, string? Role,
    bool HasHoursPerWeek, decimal? HoursPerWeek,
    bool HasWeeksPerYear, int? WeeksPerYear,
    bool HasActivityCategory, string? ActivityCategory,
    bool HasTotalHours, decimal? TotalHours,
    bool HasAchievements, string[]? Achievements,
    bool HasSkills, string[]? Skills);
