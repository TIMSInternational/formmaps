namespace FormMaps.Application.Assessments;

/// <summary>
/// Full-row projection of a <c>questions_360</c> catalog row (legacy routes/question360.ts reads return the
/// whole Prisma model with no <c>select</c>). Property names serialize camelCase (global naming policy),
/// matching the legacy JSON keys. There is NO correct-answer / scoring-key column on this model — it is a
/// 360°-evaluation prompt bank, so nothing is stripped. Timestamps are ISO-Z strings.
/// </summary>
public sealed record Question360Row(
    string Id,
    string QuestionEnglishText,
    string QuestionSpanishText,
    string Category,
    string RelationType,
    int QuestionNumber,
    bool IsSubQuestion,
    string? ParentQuestionId,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);
