using System.Text.Json;

namespace FormMaps.Application.Reports;

/// <summary>
/// Reproduces the legacy GET /api/v1/reports/evaluation/{sessionId} response payload
/// (api/src/routes/report.ts). The session is an evaluation-group id: the group is resolved
/// first, then the caller's access is gated on the group's <c>evaluatedUserId</c> via
/// canAccessUser (this is NOT a session-owned check). Sensitive group columns (evaluatorEmail,
/// invitationToken, token/email flags) and the feedback evaluatorEmail are never selected.
/// </summary>
public sealed record EvaluationReport(
    string GroupId,
    string StudentId,
    string? StudentName,
    string EvaluatorName,
    string GroupType,
    string Relation,
    bool IsCompleted,
    DateTimeOffset? CompletedDate,
    IReadOnlyList<EvaluationFeedbackEntry> Feedback,
    DateTimeOffset GeneratedAt);

/// <summary>
/// A single active evaluation-feedback row. <see cref="AverageRating"/> is the Prisma
/// <c>Decimal?</c> column emitted as a JSON string (decimal.js toString semantics, canonical,
/// trailing zeros stripped) or null — matching legacy exactly. <see cref="FeedbackItems"/> is the
/// jsonb column passed through verbatim as raw JSON (array/object), never re-shaped.
/// </summary>
public sealed record EvaluationFeedbackEntry(
    string Id,
    string? AverageRating,
    int TotalQuestions,
    int AnsweredQuestions,
    JsonElement FeedbackItems,
    DateTimeOffset? CompletedAt);

/// <summary>
/// Minimal evaluation-group projection used for the access decision. Resolved first (by group id,
/// with NO isActive filter, matching the legacy <c>findUnique</c>) so the caller's canAccessUser
/// can be evaluated against <see cref="EvaluatedUserId"/> before any feedback is read.
/// </summary>
public sealed record EvaluationGroupCore(
    string GroupId,
    string EvaluatedUserId,
    string EvaluatorName,
    string GroupType,
    string Relation,
    bool IsCompleted,
    DateTimeOffset? CompletedDate);
