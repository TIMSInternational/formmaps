using System.Data;
using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Prerequisites;

namespace FormMaps.Infrastructure.Prerequisites;

/// <summary>
/// Prerequisites WRITE (FM-DOTNET-057 — PUT /courses/:courseId/prerequisites; service updatePrerequisites). Faithful
/// port: course lookup (id + schoolId) → miss → false (endpoint 404); resolve prerequisiteRules[].courseIds → the
/// school-scoped course CODES; write prerequisites = those codes + corequisites = the body array + updatedBy = caller +
/// "updatedAt" = now() (Prisma @updatedAt). One writable RLS session + CommitAsync.
///
/// <para><b>corequisites</b> mirrors legacy <c>corequisites || []</c> passed straight to Prisma's String[] column:
/// a JSON array of strings → stored; falsy (absent/null/false/0/"") → []; a non-array-truthy value (non-empty string,
/// non-zero number, true, object) OR an array with a non-string element → the Prisma String[] type rejection = we
/// throw → the route 500 (NOT a silent coerce).</para>
///
/// <para><b>prerequisiteRules</b>: only entered when it IS an array (JS Array.isArray); each rule's courseIds are
/// resolved to codes via <c>id = ANY(ids) AND schoolId</c>. Deterministic-superset order <c>ORDER BY id ASC</c>
/// (legacy findMany has no orderBy — nondeterministic; FM-032 precedent). Non-object rules / absent-or-non-array
/// courseIds / non-string id elements are skipped (unreachable — the client always sends string[] courseIds).</para>
/// </summary>
public sealed class PrerequisitesWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IPrerequisitesWriter
{
    public async Task<bool> UpdatePrerequisitesAsync(
        RequestContext context, string schoolId, string courseId, string userId, JsonElement body,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Course lookup FIRST: id + schoolId; miss/foreign → 404 (no write). This MUST precede ParseCorequisites so a
        // missing/foreign course with a malformed corequisites body 404s (like legacy) rather than 500s — legacy only
        // reaches the Prisma corequisites String[] rejection at the update call, which never runs when the lookup 404s.
        await using (var lookup = Command(session, """
            SELECT "schoolId" FROM "school_courses" WHERE "id" = @id
            """))
        {
            AddParameter(lookup, "id", courseId);
            var found = await lookup.ExecuteScalarAsync(cancellationToken);
            if (found is null or DBNull || (string)found != schoolId)
            {
                return false;
            }
        }

        // Now the body coercions (a corequisites type-rejection → throw → 500, matching legacy's Prisma reject at the
        // update — post-lookup, so it can't pre-empt the 404 above).
        var corequisites = ParseCorequisites(body);
        var courseIdsFromRules = ExtractCourseIds(body);

        // Resolve courseIds → school-scoped codes (only when the rules yielded ids).
        var prereqCodes = Array.Empty<string>();
        if (courseIdsFromRules.Count > 0)
        {
            var codes = new List<string>();
            await using var resolve = Command(session, """
                SELECT "code" FROM "school_courses"
                WHERE "id" = ANY(@ids) AND "schoolId" = @sid
                ORDER BY "id" ASC
                """);
            AddParameter(resolve, "ids", courseIdsFromRules.ToArray());
            AddParameter(resolve, "sid", schoolId);
            await using var reader = await resolve.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                codes.Add(reader.GetString(0));
            }

            prereqCodes = codes.ToArray();
        }

        await using (var update = Command(session, """
            UPDATE "school_courses"
            SET "prerequisites" = @prereqs, "corequisites" = @coreqs, "updatedBy" = @userId, "updatedAt" = @now
            WHERE "id" = @id
            """))
        {
            AddParameter(update, "prereqs", prereqCodes);
            AddParameter(update, "coreqs", corequisites);
            AddParameter(update, "userId", userId);
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", courseId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    // ---------------------------------------------------------------- body coercion

    // corequisites || [] then Prisma String[]: array-of-strings → stored; falsy → []; else (non-array truthy / array
    // with a non-string element) → Prisma type rejection → throw → 500.
    private static string[] ParseCorequisites(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("corequisites", out var el))
        {
            return [];
        }

        switch (el.ValueKind)
        {
            case JsonValueKind.Array:
                var result = new List<string>();
                foreach (var item in el.EnumerateArray())
                {
                    if (item.ValueKind != JsonValueKind.String)
                    {
                        throw NonStringArrayElement("corequisites");
                    }

                    result.Add(item.GetString()!);
                }

                return result.ToArray();
            case JsonValueKind.Null:
            case JsonValueKind.False:
                return [];
            case JsonValueKind.String:
                return string.IsNullOrEmpty(el.GetString()) ? [] : throw NotAStringArray("corequisites");
            case JsonValueKind.Number:
                return el.GetDecimal() == 0m ? [] : throw NotAStringArray("corequisites");
            default: // True, Object → truthy non-array → 500
                throw NotAStringArray("corequisites");
        }
    }

    // flatMap((r) => r.courseIds || []) then Prisma id:{ in: <collected> } over a String column. Faithful JS edges
    // (post-lookup, so a throw here 500s only for an EXISTING course — a missing course already 404'd above):
    //   - prerequisiteRules NOT an array → the `if (Array.isArray)` block is skipped → [] (no throw).
    //   - a NULL rule element → JS `null.courseIds` throws a TypeError → 500 (we throw).
    //   - a non-object rule (string/number/bool/array) → `.courseIds` is undefined → || [] → [] (skip).
    //   - courseIds absent / null / false / "" / 0 (falsy) → || [] → [] (skip).
    //   - courseIds a non-empty STRING → flatMap does NOT flatten a string → ONE element [string].
    //   - courseIds an ARRAY → its elements; a non-string element → Prisma id:{ in:[non-string] } reject → 500 (throw).
    //   - courseIds a truthy NUMBER / TRUE / OBJECT → flatMap includes it as ONE non-string element → Prisma reject → 500.
    private static List<string> ExtractCourseIds(JsonElement body)
    {
        var ids = new List<string>();
        if (body.ValueKind != JsonValueKind.Object
            || !body.TryGetProperty("prerequisiteRules", out var rules)
            || rules.ValueKind != JsonValueKind.Array)
        {
            return ids;
        }

        foreach (var rule in rules.EnumerateArray())
        {
            if (rule.ValueKind == JsonValueKind.Null)
            {
                throw NullRuleElement(); // JS: null.courseIds → TypeError → 500
            }

            if (rule.ValueKind != JsonValueKind.Object || !rule.TryGetProperty("courseIds", out var courseIds))
            {
                continue; // non-object rule / absent courseIds → undefined → || [] → []
            }

            switch (courseIds.ValueKind)
            {
                case JsonValueKind.Array:
                    foreach (var el in courseIds.EnumerateArray())
                    {
                        if (el.ValueKind != JsonValueKind.String)
                        {
                            throw NonStringCourseId(); // non-string in id:{in} → Prisma reject → 500
                        }

                        ids.Add(el.GetString()!);
                    }

                    break;
                case JsonValueKind.String:
                    var single = courseIds.GetString()!;
                    if (!string.IsNullOrEmpty(single))
                    {
                        ids.Add(single); // truthy string → ONE element; "" is falsy → []
                    }

                    break;
                case JsonValueKind.Null:
                case JsonValueKind.False:
                    break; // falsy → []
                case JsonValueKind.Number:
                    if (courseIds.GetDecimal() != 0m)
                    {
                        throw NonStringCourseId(); // truthy number → one non-string element → Prisma reject → 500
                    }

                    break; // 0 is falsy → []
                default: // True, Object → truthy → one non-string element → Prisma reject → 500
                    throw NonStringCourseId();
            }
        }

        return ids;
    }

    private static InvalidOperationException NotAStringArray(string name) =>
        new($"{name}: non-array value for a String[] column (Prisma type rejection → 500)");

    private static InvalidOperationException NonStringArrayElement(string name) =>
        new($"{name}: non-string element for a String[] column (Prisma type rejection → 500)");

    private static InvalidOperationException NullRuleElement() =>
        new("prerequisiteRules: a null rule element (JS null.courseIds TypeError → 500)");

    private static InvalidOperationException NonStringCourseId() =>
        new("prerequisiteRules.courseIds: a non-string id (Prisma id:{ in } String rejection → 500)");

    // ---------------------------------------------------------------- npgsql plumbing

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static DateTime Now()
    {
        var utc = DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified);
        return new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }
}
