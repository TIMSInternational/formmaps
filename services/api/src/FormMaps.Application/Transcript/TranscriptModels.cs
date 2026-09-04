using System.Text.Json;

namespace FormMaps.Application.Transcript;

/// <summary>
/// A <c>student_gpas</c> row as legacy <c>serializeStudentGpa</c> emits it (transcriptService.ts:150-161):
/// every column of the Prisma row, with the four Decimal columns coerced to plain JSON numbers because
/// JSON.stringify would otherwise emit them as STRINGS and callers doing <c>.toFixed()</c> crash.
/// <c>totalCredits</c> is coerced with <c>== null ? 0</c> (never null); the other three keep null.
/// A missing row serializes as the JSON literal <c>null</c>, which the endpoints pass straight through.
/// </summary>
public sealed record StudentGpaRow(
    string Id,
    string UserId,
    double? GpaUnweighted,
    double? GpaWeighted,
    double TotalCredits,
    int? ClassRank,
    int? ClassSize,
    double? RankPercentile,
    JsonElement YearlyBreakdown,
    string ComputedAt,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>
/// A <c>gpa_configurations</c> row, full Prisma passthrough (transcript.ts:102 / :113 return the row itself).
///
/// <c>Scale</c> is a STRING on purpose. The column is DECIMAL(65,30) and legacy never coerces it — unlike the
/// student_gpas Decimals, which <c>serializeStudentGpa</c> does coerce — so Prisma's Decimal reaches
/// JSON.stringify and is emitted as a decimal.js string ("4", "4.5"). Ported as-is: see the divergence note on
/// <c>TranscriptEndpoints.GetGpaConfigAsync</c> for why this is NOT corrected here.
/// </summary>
public sealed record GpaConfigurationRow(
    string Id,
    string SchoolId,
    string Scale,
    JsonElement UnweightedMap,
    JsonElement WeightBonuses,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>Validated body of PUT /school-admin/gpa-config. A null field means "absent" (Prisma skips it).</summary>
public sealed record GpaConfigInput(
    double? Scale,
    IReadOnlyDictionary<string, double>? UnweightedMap,
    IReadOnlyDictionary<string, double>? WeightBonuses);

/// <summary>Result of POST /school-admin/class-ranks — <c>{ ranked, classSize }</c>.</summary>
public sealed record ClassRankComputation(int Ranked, int ClassSize);

/// <summary>
/// One row of GET /school-admin/class-ranks (<c>getClassRankings</c>, transcriptService.ts:318-332).
/// <c>UserFound</c> carries the legacy <c>user?.gradeLevel</c> quirk: when the joined users row is not visible
/// the property is <c>undefined</c> and JSON.stringify DROPS the key entirely — the endpoint reproduces that
/// by projecting a shape without <c>gradeLevel</c> rather than emitting null.
/// </summary>
public sealed record ClassRankingRow(
    string StudentId,
    string StudentName,
    bool UserFound,
    int? GradeLevel,
    int? Rank,
    double Gpa,
    double WeightedGpa,
    double TotalCredits,
    int? ClassSize,
    int Percentile,
    string ComputedAt);
