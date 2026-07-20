namespace FormMaps.Application.Gradebook;

/// <summary>
/// A student_grades row, full passthrough — mirrors the legacy getTranscriptData row shape
/// (<c>{ ...r, credits: Number(r.credits) }</c>): every column verbatim, credits as a JSON number,
/// timestamps ISO-Z. Serialized with the Web camelCase property policy (id, schoolId, credits, ...).
/// </summary>
public sealed record TranscriptGradeRow(
    string Id,
    string SchoolId,
    string StudentId,
    string? CourseId,
    string? CourseCode,
    string? Semester,
    string? Grade,
    double Credits,
    string Status,
    string? ImportJobId,
    string? CourseLevel,
    string? AcademicYear,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>
/// The transcript read response: grades grouped by academic year (dictionary keys in query order —
/// academicYear DESC, semester ASC; a null/empty year collapses to the literal key "Unknown") + the GPA
/// summary. GPAs are null when no credited grade qualifies while totalCredits stays the number 0.
/// </summary>
public sealed record StudentTranscript(
    IReadOnlyDictionary<string, IReadOnlyList<TranscriptGradeRow>> ByYear,
    double? GpaUnweighted,
    double? GpaWeighted,
    double TotalCredits);
