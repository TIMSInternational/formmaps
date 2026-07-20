using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Reads the global <c>questions_360</c> 360°-evaluation catalog (legacy routes/question360.ts GET reads).
/// The table is an unpolicied global reference bank (no schoolId / no tenant scope); the endpoints authorize
/// by authentication (+ the <c>evaluations:manage</c> permission on the sub-questions/by-id routes). Every
/// list read filters <c>isActive = true</c> and orders by <c>questionNumber</c> ASC; <see cref="GetByIdAsync"/>
/// is a findUnique with NO isActive filter (matches legacy).
/// </summary>
public interface IQuestion360Reader
{
    /// <summary>Active questions, optionally filtered by an exact relationType (null = all).</summary>
    Task<IReadOnlyList<Question360Row>> ListAsync(
        RequestContext context, string? relationType, CancellationToken cancellationToken = default);

    /// <summary>Active questions in an exact category.</summary>
    Task<IReadOnlyList<Question360Row>> ListByCategoryAsync(
        RequestContext context, string category, CancellationToken cancellationToken = default);

    /// <summary>Active sub-questions of a parent question.</summary>
    Task<IReadOnlyList<Question360Row>> ListByParentAsync(
        RequestContext context, string parentQuestionId, CancellationToken cancellationToken = default);

    /// <summary>A single question by id (no isActive filter); null when absent.</summary>
    Task<Question360Row?> GetByIdAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default);
}
