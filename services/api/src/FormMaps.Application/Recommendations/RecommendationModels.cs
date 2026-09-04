namespace FormMaps.Application.Recommendations;

/// <summary>
/// Row shapes for the letters-of-recommendation port (formmaps#59 — routes/recommendations.ts +
/// services/recommendationsService.ts, mounted /api/v1/recommendations). Timestamps are pre-rendered ISO-Z strings
/// (the Prisma/JSON wire shape) so the endpoint layer never re-formats a <see cref="DateTime"/>.
/// </summary>
public sealed record RecommendationRequestRow(
    string Id,
    string StudentId,
    string RecommenderId,
    string Status,
    string? Relationship,
    string? RequestMessage,
    string? DeclineReason,
    string? DueDate,
    string? SubmittedAt,
    string? LetterFileKey,
    string? LetterFileName,
    string? LetterUploadedAt,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>The nested `recommender` include on GET / : { id, name, email, roleName }.</summary>
public sealed record RecommenderRef(string Id, string? Name, string Email, string? RoleName);

/// <summary>The nested `student` / `recommender` include shape used everywhere else: { id, name, email }.</summary>
public sealed record UserRef(string Id, string? Name, string Email);

/// <summary>A row of `recommendation_application_links` (Prisma `include: { applicationLinks: true }`).</summary>
public sealed record RecommendationApplicationLinkRow(
    string Id,
    string RecommendationRequestId,
    string StudentApplicationId,
    bool IsSubmitted,
    string? SubmittedAt,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>GET / — a student's own request plus its recommender and links.</summary>
public sealed record StudentRequestRow(
    RecommendationRequestRow Request,
    RecommenderRef Recommender,
    IReadOnlyList<RecommendationApplicationLinkRow> ApplicationLinks);

/// <summary>GET /received — a request directed at the caller, plus its student and links.</summary>
public sealed record ReceivedRequestRow(
    RecommendationRequestRow Request,
    UserRef Student,
    IReadOnlyList<RecommendationApplicationLinkRow> ApplicationLinks);

/// <summary>GET /dashboard — both sides plus links.</summary>
public sealed record DashboardRequestRow(
    RecommendationRequestRow Request,
    UserRef Student,
    UserRef Recommender,
    IReadOnlyList<RecommendationApplicationLinkRow> ApplicationLinks);

/// <summary>GET /staff — an eligible recommender.</summary>
public sealed record EligibleRecommender(string Id, string? Name, string Email, string? RoleName);

/// <summary>The columns createRequest / isEligibleRecommender read off a user row.</summary>
public sealed record RecommendationUser(
    string Id, string? Name, string Email, string? RoleName, string? SchoolId, bool IsActive);

/// <summary>loadOwnedByRecommender's findUnique: the row plus both nested user includes.</summary>
public sealed record OwnedRequest(
    RecommendationRequestRow Request, UserRef Student, UserRef Recommender);

/// <summary>Input for createRequest and for the reactivation update it may take instead.</summary>
public sealed record CreateRequestInput(
    string StudentId,
    string? SchoolId,
    string RecommenderId,
    string Relationship,
    string RequestMessage,
    string? DueDate);

/// <summary>Which dashboard scope to run (getDashboard's three role branches).</summary>
public enum DashboardScope
{
    /// <summary>teacher → recommenderId = self.</summary>
    Recommender,

    /// <summary>counselor → studentId IN (their active assignments).</summary>
    AssignedStudents,

    /// <summary>school_admin / Super Admin → studentId IN (active users of the school).</summary>
    SchoolStudents,
}

/// <summary>getDashboard's envelope: { total, countByStatus, requests }.</summary>
public sealed record DashboardResult(
    int Total,
    IReadOnlyDictionary<string, int> CountByStatus,
    IReadOnlyList<DashboardRequestRow> Requests);

/// <summary>getLetterDownloadUrl's payload: { url, filename }.</summary>
public sealed record LetterDownload(string Url, string Filename);

/// <summary>The uploaded letter part (multer's file: originalname / mimetype / buffer).</summary>
public sealed record LetterUpload(string OriginalName, string MimeType, byte[] Buffer);

/// <summary>Outcome of the INSERT half of createRequest — Duplicate is Prisma's P2002 on (studentId, recommenderId).</summary>
public sealed record CreateRowResult(RecommendationRequestRow? Row, bool Duplicate);
