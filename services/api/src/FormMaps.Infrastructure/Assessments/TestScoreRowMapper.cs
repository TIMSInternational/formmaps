using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Shared full-row projection + reader for student_test_scores, used by both the reads (list/student-view) and
/// the writes (INSERT/UPDATE … RETURNING). Keeping one projection+mapper prevents the read and write paths from
/// drifting on column order, Decimal/jsonb handling, or timestamp formatting. subScores comes back as ::text
/// (verbatim jsonb, SQL-null and jsonb 'null' both surface as a JSON-null element); timestamps are ISO-Z.
/// </summary>
public static class TestScoreRowMapper
{
    /// <summary>The 23-column full-row projection (subScores cast to text), column order = <see cref="Read"/>.</summary>
    public const string Projection =
        "\"id\", \"userId\", \"testType\", \"testDate\", \"satTotal\", \"satMath\", \"satReading\", \"actComposite\", "
        + "\"actEnglish\", \"actMath\", \"actReading\", \"actScience\", \"apSubject\", \"apScore\", \"totalScore\", "
        + "\"subScores\"::text AS \"subScores\", \"isSuperScore\", \"isOfficial\", \"isActive\", "
        + "\"createdBy\", \"createdDate\", \"updatedBy\", \"updatedAt\"";

    public static TestScoreRow Read(DbDataReader reader) => new(
        Id: reader.GetString(0),
        UserId: reader.GetString(1),
        TestType: reader.GetString(2),
        TestDate: reader.IsDBNull(3) ? null : IsoZ(reader.GetDateTime(3)),
        SatTotal: NullableInt(reader, 4),
        SatMath: NullableInt(reader, 5),
        SatReading: NullableInt(reader, 6),
        ActComposite: NullableInt(reader, 7),
        ActEnglish: NullableInt(reader, 8),
        ActMath: NullableInt(reader, 9),
        ActReading: NullableInt(reader, 10),
        ActScience: NullableInt(reader, 11),
        ApSubject: reader.IsDBNull(12) ? null : reader.GetString(12),
        ApScore: NullableInt(reader, 13),
        TotalScore: NullableInt(reader, 14),
        SubScores: ReadJson(reader, 15),
        IsSuperScore: reader.GetBoolean(16),
        IsOfficial: reader.GetBoolean(17),
        IsActive: reader.GetBoolean(18),
        CreatedBy: reader.IsDBNull(19) ? null : reader.GetString(19),
        CreatedDate: IsoZ(reader.GetDateTime(20)),
        UpdatedBy: reader.IsDBNull(21) ? null : reader.GetString(21),
        UpdatedAt: IsoZ(reader.GetDateTime(22)));

    private static int? NullableInt(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);

    // jsonb-as-text -> JsonElement (verbatim; SQL NULL and jsonb 'null' both surface as a JSON-null element).
    private static JsonElement ReadJson(DbDataReader reader, int ordinal)
    {
        var raw = reader.IsDBNull(ordinal) ? "null" : reader.GetString(ordinal);
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
