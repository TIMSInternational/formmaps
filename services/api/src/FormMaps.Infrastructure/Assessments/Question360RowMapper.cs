using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Assessments;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Shared full-row projection + mapper for <c>questions_360</c>, used by both <see cref="Question360Reader"/> and
/// <see cref="Question360Writer"/> so the read and write paths cannot drift on column set / order / formatting.
/// Timestamps are emitted ISO-Z (the columns are <c>TIMESTAMP(3)</c> without tz; the stored wall-clock is relabeled
/// UTC to match Prisma's UTC interpretation + <c>toISOString()</c>).
/// </summary>
public static class Question360RowMapper
{
    /// <summary>The 13 columns in a fixed order (no SELECT/FROM) — reused in reader SELECTs and writer RETURNINGs.</summary>
    public const string Projection =
        "\"id\", \"questionEnglishText\", \"questionSpanishText\", \"category\", \"relationType\", \"questionNumber\", " +
        "\"isSubQuestion\", \"parentQuestionId\", \"isActive\", \"createdBy\", \"createdDate\", \"updatedBy\", \"updatedAt\"";

    public static Question360Row Read(DbDataReader reader) => new(
        Id: reader.GetString(0),
        QuestionEnglishText: reader.GetString(1),
        QuestionSpanishText: reader.GetString(2),
        Category: reader.GetString(3),
        RelationType: reader.GetString(4),
        QuestionNumber: reader.GetInt32(5),
        IsSubQuestion: reader.GetBoolean(6),
        ParentQuestionId: reader.IsDBNull(7) ? null : reader.GetString(7),
        IsActive: reader.GetBoolean(8),
        CreatedBy: reader.IsDBNull(9) ? null : reader.GetString(9),
        CreatedDate: IsoZ(reader.GetDateTime(10)),
        UpdatedBy: reader.IsDBNull(11) ? null : reader.GetString(11),
        UpdatedAt: IsoZ(reader.GetDateTime(12)));

    public static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
