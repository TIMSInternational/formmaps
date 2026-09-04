using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

// FM-CF-007. THE one read path for a student's completed vocational 360 rater groups and their item
// responses. It was <c>VocationalWriter.LoadGroupsAsync</c> and is lifted here VERBATIM — same SQL, same
// LEFT JOIN, same group filter, same deterministic ordering, same defensive jsonb parsers — because
// CareerFit's 360 adapter needs exactly the rows the vocational recompute needs, and two queries that
// must agree about what "the student's 360 responses" means would eventually stop agreeing. The writer
// now delegates here; nothing about its behaviour changed.
//
// Deliberately NOT here: opening or committing a session (the CALLER's session is passed in, so the
// writer keeps its writable transaction and CareerFitInputReader keeps its read-only RLS one — this file
// never chooses a session and can never bypass RLS), instrument-version filtering (the chassis has never
// filtered by version; the CareerFit adapter selects its items by variable code instead), and any
// scoring or aggregation.

/// <summary>Loads one student's completed vocational rater groups with their active item responses.</summary>
public static class VocationalResponseLoader
{
    // LEFT JOIN (isActive predicate in the ON clause): legacy uses a Prisma `include`, which returns a
    // completed group EVEN when it has zero active responses — such a group must still count as a present
    // rater (respondentCount / hasSelf gating / weight renorm), which an inner join would silently drop.
    // Each evaluation_group is its own ScoringGroup (two 'teacher' groups stay two groups). TS has no
    // orderBy (DB-arbitrary); we order deterministically (createdDate, id / questionNumber) — a stable
    // superset of the legacy non-deterministic order (only affects ranking tie / duplicate-group-key order,
    // where TS is itself non-deterministic, so no byte-match exists).
    private const string GroupsSql = """
        SELECT eg."id", eg."groupType", vr."id", vr."questionNumber", vr."type", vr."dimensionKey",
               vr."ratingValue", vr."rankingOrder"::text, vr."selectedValues"::text, vr."textValue"
        FROM "evaluation_groups" eg
        LEFT JOIN "vocational_responses" vr ON vr."evaluationGroupId" = eg."id" AND vr."isActive" = true
        WHERE eg."evaluatedUserId" = @uid AND eg."instrument" = 'vocational'
          AND eg."isEvaluationCompleted" = true AND eg."isActive" = true
        ORDER BY eg."createdDate" ASC, eg."id" ASC, vr."questionNumber" ASC NULLS FIRST
        """;

    /// <summary>
    /// The student's completed, active vocational rater groups, in creation order, each carrying its
    /// active responses in question-number order. Only the four canonical rater groups
    /// (<see cref="VocationalScoring.Groups"/>) are returned; a completed group with no active responses is
    /// still returned, with an empty response list, because it is still a present rater.
    /// </summary>
    public static async Task<List<ScoringGroup>> LoadGroupsAsync(
        FormMapsDatabaseSession session, string evaluatedUserId, CancellationToken cancellationToken)
    {
        var byGroup = new List<(string Id, string GroupType, List<ScoringResponse> Responses)>();
        var index = new Dictionary<string, List<ScoringResponse>>(StringComparer.Ordinal);

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = GroupsSql;
        var parameter = command.CreateParameter();
        parameter.ParameterName = "uid";
        parameter.Value = evaluatedUserId;
        command.Parameters.Add(parameter);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var groupId = reader.GetString(0);
            var groupType = reader.GetString(1);
            // Only the four canonical rater groups are scored (legacy filter on VOCATIONAL_GROUPS).
            if (!VocationalScoring.Groups.Contains(groupType))
            {
                continue;
            }

            if (!index.TryGetValue(groupId, out var responses))
            {
                responses = [];
                index[groupId] = responses;
                byGroup.Add((groupId, groupType, responses));
            }

            // A LEFT-JOIN row with a null vr id = a completed group with no active responses: register the
            // group (above) but add no response.
            if (reader.IsDBNull(2))
            {
                continue;
            }

            responses.Add(new ScoringResponse(
                QuestionNumber: reader.GetInt32(3),
                Type: reader.GetString(4),
                DimensionKey: reader.IsDBNull(5) ? null : reader.GetString(5),
                RatingValue: reader.IsDBNull(6) ? null : reader.GetInt32(6),
                RankingOrder: reader.IsDBNull(7) ? null : ParseRankingOrder(reader.GetString(7)),
                SelectedValues: reader.IsDBNull(8) ? null : ParseStringArray(reader.GetString(8)),
                TextValue: reader.IsDBNull(9) ? null : reader.GetString(9)));
        }

        return byGroup.Select(g => new ScoringGroup(g.GroupType, g.Responses)).ToList();
    }

    // asRankingOrder: [{ value, rank }] when a JSON array, else null (legacy Array.isArray guard).
    private static IReadOnlyList<RankingEntry>? ParseRankingOrder(string json)
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Array)
        {
            return null; // legacy: Array.isArray(...) ? ... : null
        }

        var entries = new List<RankingEntry>();
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            if (el.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var value = el.TryGetProperty("value", out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : string.Empty;
            var rank = el.TryGetProperty("rank", out var r) && r.ValueKind == JsonValueKind.Number && r.TryGetInt32(out var ri) ? ri : 0;
            entries.Add(new RankingEntry(value, rank));
        }

        return entries;
    }

    // asStringArray: the string members of a JSON array, else null.
    private static IReadOnlyList<string>? ParseStringArray(string json)
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var values = new List<string>();
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            if (el.ValueKind == JsonValueKind.String)
            {
                values.Add(el.GetString()!);
            }
        }

        return values;
    }
}
