using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Gradebook;
using FormMaps.Application.Transcript;
using FormMaps.Infrastructure.Gradebook;

namespace FormMaps.Infrastructure.Transcript;

/// <summary>
/// Writes for routes/transcript.ts (issue #55): computeAndPersistGpa, the gpa-config upsert, and
/// computeClassRanks. All three open ONE writable session under the CALLER's RLS GUCs and commit at the end —
/// legacy does the same (<c>tenantGucOp</c> / <c>setTenantGuc</c> SET the tenant GUCs inside the transaction;
/// they do not bypass RLS), so <c>student_gpas</c>' school-inherit policy is a live backstop on every row
/// written here.
///
/// Prisma upserts are modelled as INSERT ... ON CONFLICT ("userId"/"schoolId") DO UPDATE, which is the same
/// find-or-create outcome without the read-then-write race.
/// </summary>
public sealed class TranscriptWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ITranscriptWriter
{
    // ------------------------------------------------------------------ compute-gpa

    /// <summary>
    /// transcriptService.ts:167-205. Note the deliberate <c>?? null</c> on both GPAs: removing the last graded
    /// course must CLEAR a stale GPA, not leave the previous value. That is the opposite of
    /// <see cref="ComputeClassRanksAsync"/>'s <c>?? undefined</c>, and both are ported as written.
    /// </summary>
    public async Task<StudentGpaRow> ComputeAndPersistGpaAsync(
        RequestContext context, string userId, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Legacy's findMany here has no orderBy; LoadGradesAsync adds ORDER BY academicYear DESC, semester ASC.
        // That is behaviour-neutral: the order only reaches yearlyBreakdown's KEY order, and the column is jsonb,
        // which normalizes key order on storage. Reusing the shared loader beats a second grade query.
        var grades = await TranscriptDataQuery.LoadGradesAsync(session, userId, schoolId, cancellationToken);
        var (unweighted, bonuses) = await TranscriptDataQuery.ResolveGpaConfigAsync(session, schoolId, cancellationToken);

        var gpa = GpaComputation.ComputeGpa(
            grades.Select(g => new GpaGradeInput(g.Grade, g.Credits, g.CourseLevel)), unweighted, bonuses);
        var yearlyBreakdown = BuildYearlyBreakdown(
            TranscriptDataQuery.GroupByAcademicYear(grades)
                .ToDictionary(kv => kv.Key, kv => (IReadOnlyList<GpaGradeInput>)kv.Value
                    .Select(g => new GpaGradeInput(g.Grade, g.Credits, g.CourseLevel)).ToList(), StringComparer.Ordinal),
            unweighted,
            bonuses);

        var now = Now();

        await using var command = TranscriptDataQuery.Command(session, """
            INSERT INTO "student_gpas"
                ("id", "userId", "gpaUnweighted", "gpaWeighted", "totalCredits", "yearlyBreakdown",
                 "computedAt", "createdBy", "createdDate", "updatedAt")
            VALUES (@id, @uid, @gu::numeric, @gw::numeric, @tc::numeric, @yb::jsonb, @now, @uid, @now, @now)
            ON CONFLICT ("userId") DO UPDATE SET
                "gpaUnweighted" = EXCLUDED."gpaUnweighted",
                "gpaWeighted"   = EXCLUDED."gpaWeighted",
                "totalCredits"  = EXCLUDED."totalCredits",
                "yearlyBreakdown" = EXCLUDED."yearlyBreakdown",
                "computedAt"    = EXCLUDED."computedAt",
                "updatedBy"     = @uid,
                "updatedAt"     = @now
            RETURNING "id", "userId",
                      "gpaUnweighted"::double precision, "gpaWeighted"::double precision,
                      "totalCredits"::double precision, "classRank", "classSize",
                      "rankPercentile"::double precision, "yearlyBreakdown"::text,
                      "computedAt", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
            """);
        TranscriptDataQuery.AddParameter(command, "id", Guid.NewGuid().ToString());
        TranscriptDataQuery.AddParameter(command, "uid", userId);
        TranscriptDataQuery.AddParameter(command, "gu", gpa.GpaUnweighted);
        TranscriptDataQuery.AddParameter(command, "gw", gpa.GpaWeighted);
        TranscriptDataQuery.AddParameter(command, "tc", gpa.TotalCredits);
        TranscriptDataQuery.AddParameter(command, "yb", yearlyBreakdown);
        AddTimestamp(command, "now", now);

        StudentGpaRow row;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            if (!await reader.ReadAsync(cancellationToken))
            {
                // RLS refused the row (WITH CHECK). Surfacing this instead of returning a phantom row keeps the
                // failure loud — legacy would have thrown from Prisma here too.
                throw new InvalidOperationException("student_gpas upsert returned no row (RLS WITH CHECK refused the write)");
            }

            row = TranscriptReader.ReadStudentGpa(reader);
        }

        await session.CommitAsync(cancellationToken);
        return row;
    }

    // ------------------------------------------------------------------ gpa-config upsert

    /// <summary>
    /// transcript.ts:97-101. On CREATE only <c>createdBy</c> is written (updatedBy stays NULL) and the absent
    /// fields take the legacy DEFAULT_* constants; on UPDATE only <c>updatedBy</c> plus the fields actually
    /// present in the body are written — an absent field is <c>undefined</c>, which Prisma SKIPS, so the stored
    /// value survives. The SQL below reproduces that by building the DO UPDATE SET list from the same condition.
    /// </summary>
    public async Task<GpaConfigurationRow> UpsertGpaConfigAsync(
        RequestContext context, string schoolId, string actorId, GpaConfigInput input, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var assignments = new List<string> { "\"updatedBy\" = @actor", "\"updatedAt\" = @now" };
        if (input.Scale is not null)
        {
            assignments.Add("\"scale\" = EXCLUDED.\"scale\"");
        }

        if (input.UnweightedMap is not null)
        {
            assignments.Add("\"unweightedMap\" = EXCLUDED.\"unweightedMap\"");
        }

        if (input.WeightBonuses is not null)
        {
            assignments.Add("\"weightBonuses\" = EXCLUDED.\"weightBonuses\"");
        }

        await using var command = TranscriptDataQuery.Command(session, $"""
            INSERT INTO "gpa_configurations"
                ("id", "schoolId", "scale", "unweightedMap", "weightBonuses", "createdBy", "createdDate", "updatedAt")
            VALUES (@id, @school, @scale::numeric, @unweighted::jsonb, @bonuses::jsonb, @actor, @now, @now)
            ON CONFLICT ("schoolId") DO UPDATE SET
                {string.Join(",\n                ", assignments)}
            RETURNING "id", "schoolId", "scale"::text, "unweightedMap"::text, "weightBonuses"::text,
                      "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
            """);
        TranscriptDataQuery.AddParameter(command, "id", Guid.NewGuid().ToString());
        TranscriptDataQuery.AddParameter(command, "school", schoolId);
        TranscriptDataQuery.AddParameter(command, "actor", actorId);
        // create: scale ?? 4.0, unweightedMap ?? DEFAULT_UNWEIGHTED_MAP, weightBonuses ?? DEFAULT_WEIGHT_BONUSES.
        TranscriptDataQuery.AddParameter(command, "scale", input.Scale ?? 4.0d);
        TranscriptDataQuery.AddParameter(command, "unweighted",
            SerializeNumberMap(input.UnweightedMap ?? GpaComputation.DefaultUnweightedMap));
        TranscriptDataQuery.AddParameter(command, "bonuses",
            SerializeNumberMap(input.WeightBonuses ?? GpaComputation.DefaultWeightBonuses));
        AddTimestamp(command, "now", Now());

        GpaConfigurationRow row;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            if (!await reader.ReadAsync(cancellationToken))
            {
                throw new InvalidOperationException("gpa_configurations upsert returned no row");
            }

            row = TranscriptReader.ReadGpaConfig(reader);
        }

        await session.CommitAsync(cancellationToken);
        return row;
    }

    // ------------------------------------------------------------------ class ranks

    /// <summary>
    /// transcriptService.ts:211-293. Ranks EVERY active student school_user, including those with no grades at
    /// all (their gpaWeighted is null, which sorts last on the <c>?? -1</c> key) — <c>classSize</c> is the
    /// roster size, not the number of students who have a GPA.
    /// </summary>
    public async Task<ClassRankComputation> ComputeClassRanksAsync(
        RequestContext context, string schoolId, string adminUserId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var studentIds = await TranscriptReader.ReadActiveStudentIdsAsync(session, schoolId, cancellationToken);
        if (studentIds.Count == 0)
        {
            return new ClassRankComputation(0, 0);
        }

        var (unweighted, bonuses) = await TranscriptDataQuery.ResolveGpaConfigAsync(session, schoolId, cancellationToken);

        // One bulk grade read for the whole roster, exactly as legacy does (studentId IN (...)).
        var gradesByStudent = new Dictionary<string, List<(string Year, GpaGradeInput Grade)>>(StringComparer.Ordinal);
        await using (var command = TranscriptDataQuery.Command(session, """
            SELECT "studentId", "grade", "credits"::double precision, "courseLevel", "academicYear"
            FROM "student_grades"
            WHERE "schoolId" = @school AND "studentId" = ANY(@ids) AND "isActive" = true
            """))
        {
            TranscriptDataQuery.AddParameter(command, "school", schoolId);
            TranscriptDataQuery.AddParameter(command, "ids", studentIds.ToArray());
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var studentId = reader.GetString(0);
                if (!gradesByStudent.TryGetValue(studentId, out var list))
                {
                    list = [];
                    gradesByStudent[studentId] = list;
                }

                list.Add((
                    reader.IsDBNull(4) || reader.GetString(4).Length == 0 ? "Unknown" : reader.GetString(4),
                    new GpaGradeInput(
                        reader.IsDBNull(1) ? null : reader.GetString(1),
                        reader.IsDBNull(2) ? 0d : reader.GetDouble(2),
                        reader.IsDBNull(3) ? null : reader.GetString(3))));
            }
        }

        var computed = new List<(string UserId, GpaResult Gpa, string YearlyBreakdown)>(studentIds.Count);
        foreach (var studentId in studentIds)
        {
            var grades = gradesByStudent.TryGetValue(studentId, out var rows) ? rows : [];
            var gpa = GpaComputation.ComputeGpa(grades.Select(g => g.Grade), unweighted, bonuses);

            var byYear = new Dictionary<string, IReadOnlyList<GpaGradeInput>>(StringComparer.Ordinal);
            var order = new List<string>();
            foreach (var (year, grade) in grades)
            {
                if (!byYear.TryGetValue(year, out var bucket))
                {
                    bucket = new List<GpaGradeInput>();
                    byYear[year] = bucket;
                    order.Add(year);
                }

                ((List<GpaGradeInput>)bucket).Add(grade);
            }

            var ordered = new Dictionary<string, IReadOnlyList<GpaGradeInput>>(StringComparer.Ordinal);
            foreach (var key in order)
            {
                ordered[key] = byYear[key];
            }

            computed.Add((studentId, gpa, BuildYearlyBreakdown(ordered, unweighted, bonuses)));
        }

        // sort((a,b) => (b.gpaWeighted ?? -1) - (a.gpaWeighted ?? -1)). Array.prototype.sort is STABLE (ES2019),
        // so equal keys keep the roster order the school_users read produced — OrderByDescending is stable too.
        var ranked = computed.OrderByDescending(c => c.Gpa.GpaWeighted ?? -1d).ToList();
        var classSize = ranked.Count;
        var now = Now();

        for (var index = 0; index < ranked.Count; index++)
        {
            var entry = ranked[index];
            var rank = index + 1;
            var rankPercentile = classSize > 1
                ? Math.Round((double)(classSize - rank) / (classSize - 1) * 10000d, MidpointRounding.AwayFromZero) / 10000d
                : 1.0d;

            // The `?? undefined` asymmetry (transcriptService.ts:266-267 / :278-279): on UPDATE, Prisma SKIPS an
            // undefined field, so a student whose GPA computes to null KEEPS their previous stored GPA here — the
            // opposite of computeAndPersistGpa's explicit `?? null`. COALESCE(EXCLUDED, existing) is that skip.
            // On INSERT the column simply stays NULL. Ported as written; see the decisions list.
            await using var command = TranscriptDataQuery.Command(session, """
                INSERT INTO "student_gpas"
                    ("id", "userId", "gpaUnweighted", "gpaWeighted", "totalCredits", "classRank", "classSize",
                     "rankPercentile", "yearlyBreakdown", "computedAt", "createdBy", "createdDate", "updatedAt")
                VALUES (@id, @uid, @gu::numeric, @gw::numeric, @tc::numeric, @rank, @size,
                        @pct::numeric, @yb::jsonb, @now, @actor, @now, @now)
                ON CONFLICT ("userId") DO UPDATE SET
                    "gpaUnweighted" = COALESCE(EXCLUDED."gpaUnweighted", "student_gpas"."gpaUnweighted"),
                    "gpaWeighted"   = COALESCE(EXCLUDED."gpaWeighted",   "student_gpas"."gpaWeighted"),
                    "totalCredits"  = EXCLUDED."totalCredits",
                    "classRank"     = EXCLUDED."classRank",
                    "classSize"     = EXCLUDED."classSize",
                    "rankPercentile" = EXCLUDED."rankPercentile",
                    "yearlyBreakdown" = EXCLUDED."yearlyBreakdown",
                    "computedAt"    = EXCLUDED."computedAt",
                    "updatedBy"     = @actor,
                    "updatedAt"     = @now
                """);
            TranscriptDataQuery.AddParameter(command, "id", Guid.NewGuid().ToString());
            TranscriptDataQuery.AddParameter(command, "uid", entry.UserId);
            TranscriptDataQuery.AddParameter(command, "gu", entry.Gpa.GpaUnweighted);
            TranscriptDataQuery.AddParameter(command, "gw", entry.Gpa.GpaWeighted);
            TranscriptDataQuery.AddParameter(command, "tc", entry.Gpa.TotalCredits);
            TranscriptDataQuery.AddParameter(command, "rank", rank);
            TranscriptDataQuery.AddParameter(command, "size", classSize);
            TranscriptDataQuery.AddParameter(command, "pct", rankPercentile);
            TranscriptDataQuery.AddParameter(command, "yb", entry.YearlyBreakdown);
            TranscriptDataQuery.AddParameter(command, "actor", adminUserId);
            AddTimestamp(command, "now", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return new ClassRankComputation(classSize, classSize);
    }

    // ------------------------------------------------------------------ helpers

    // yearlyBreakdown: { [year]: { gpaUnweighted, gpaWeighted, totalCredits } } — computeGpa per bucket, with the
    // same null/0 asymmetry the whole-transcript result has.
    private static string BuildYearlyBreakdown(
        IReadOnlyDictionary<string, IReadOnlyList<GpaGradeInput>> byYear,
        IReadOnlyDictionary<string, double> unweighted,
        IReadOnlyDictionary<string, double> bonuses)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            foreach (var (year, grades) in byYear)
            {
                var gpa = GpaComputation.ComputeGpa(grades, unweighted, bonuses);
                writer.WriteStartObject(year);
                if (gpa.GpaUnweighted is null)
                {
                    writer.WriteNull("gpaUnweighted");
                }
                else
                {
                    writer.WriteNumber("gpaUnweighted", gpa.GpaUnweighted.Value);
                }

                if (gpa.GpaWeighted is null)
                {
                    writer.WriteNull("gpaWeighted");
                }
                else
                {
                    writer.WriteNumber("gpaWeighted", gpa.GpaWeighted.Value);
                }

                writer.WriteNumber("totalCredits", gpa.TotalCredits);
                writer.WriteEndObject();
            }

            writer.WriteEndObject();
        }

        return System.Text.Encoding.UTF8.GetString(stream.ToArray());
    }

    private static string SerializeNumberMap(IReadOnlyDictionary<string, double> map)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            foreach (var (key, value) in map)
            {
                writer.WriteNumber(key, value);
            }

            writer.WriteEndObject();
        }

        return System.Text.Encoding.UTF8.GetString(stream.ToArray());
    }

    // Kind=Unspecified, ms-truncated — same convention as CalendarWriter (Prisma writes TIMESTAMP(3)).
    private static DateTime Now()
    {
        var utc = DateTime.UtcNow;
        return DateTime.SpecifyKind(
            new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified),
            DateTimeKind.Unspecified);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = System.Data.DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
