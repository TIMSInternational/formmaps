using System.Text.Json;

namespace FormMaps.Application.CareerFit.Shadow;

// FM-CF-013. The LEGACY half of the shadow comparison, as the platform actually stores it.
//
// WHAT THIS READS AND WHY IT IS THE CACHE AND NOT THE ENDPOINT. The manifest's legacyBaseline is
// POST /api/v1/careers/score, served by legacy Node. Calling it from the shadow job would put the
// job on the live request path of the very surface the migration is trying not to disturb — it
// would need a user's bearer token, it would re-run the AI half of the legacy profile, and a slow
// or failing shadow call would become a slow or failing user request. The platform already caches
// that endpoint's answer, keyed by student, in user_career_profiles."careerMatches" (legacy
// careerService writes it; CounselorCaseloadReader and CoursePlanComputeReader already read it),
// so the shadow job reads the cache. The consequence is stated rather than hidden: the legacy side
// of a comparison is the answer legacy gave WHEN IT LAST SCORED that student, not an answer
// produced at comparison time, which is why the row records "legacyObservedAt" and why the report
// says how stale the cohort's legacy half was.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not interpret the legacy scores. In particular it
// does not compare "totalScore" against CareerFitAbsolute: 360 is not seeded (FM-CF-006) and
// personality may be absent, so up to 45% of the .NET model's weight is constant and its index is
// uniformly deflated. Only the ORDERING is comparable. Nothing here ranks either — that is
// CareerFitShadowComparator's job, over families, after the projection has been applied.

/// <summary>One scored career from a legacy /careers/score answer (apps/web/src/types/tims.ts ScoredCareer).</summary>
/// <param name="ProgramId">Legacy program id, e.g. <c>SOC-021</c>. Kept only so a disagreement can be traced back to a row.</param>
/// <param name="ProgramTitle">Legacy program title. Never used to join anything — the join is on <paramref name="Cluster"/>.</param>
/// <param name="Cluster">The legacy cluster label, e.g. <c>Social_and_Behavioral_Sciences</c>. The ONLY field the projection consumes.</param>
/// <param name="TotalScore">Legacy 0–100 score. Used for ORDERING within the legacy side only, never compared to a CareerFit scalar.</param>
public sealed record LegacyCareerScore(string ProgramId, string ProgramTitle, string Cluster, double TotalScore);

/// <summary>
/// A student's cached legacy career answer. <see cref="Locked"/> is legacy's own "assessments are
/// incomplete, these are not real matches" flag; a locked or empty answer is recorded as an
/// incomparable pair rather than skipped, so the report's denominator stays honest.
/// </summary>
/// <param name="UserId">The student the cached answer belongs to.</param>
/// <param name="Locked">Legacy's <c>locked</c> flag, or true when the cache carried no scorable career.</param>
/// <param name="Careers">The scored careers, in the order the cache held them (legacy's own ranking).</param>
/// <param name="ObservedAt">When the cache row was last written, when the platform records it; null when it does not.</param>
public sealed record LegacyCareerRanking(
    string UserId,
    bool Locked,
    IReadOnlyList<LegacyCareerScore> Careers,
    DateTimeOffset? ObservedAt)
{
    /// <summary>A student whose cache row exists but holds nothing scorable.</summary>
    public static LegacyCareerRanking LockedFor(string userId, DateTimeOffset? observedAt = null) =>
        new(userId, Locked: true, Careers: [], ObservedAt: observedAt);

    /// <summary>
    /// Parses the <c>careerMatches</c> jsonb as legacy writes it. TOLERANT BY DESIGN, and the
    /// tolerance is enumerated rather than open-ended:
    /// <list type="bullet">
    /// <item>the document may be the array itself, or an object carrying it under <c>careers</c> /
    /// <c>careerMatches</c> / <c>matches</c> — the platform's own reader
    /// (<c>CoursePlanComputers.Extract</c>) already has to handle both an array and an object here;</item>
    /// <item>an object document with a truthy <c>locked</c> is legacy's locked answer;</item>
    /// <item>keys are matched case-insensitively (<c>programId</c> / <c>ProgramId</c>);</item>
    /// <item>an entry with no cluster string and no numeric score is DROPPED, not defaulted — a
    /// cluster is the only thing the projection can use, and a career with none cannot be projected
    /// onto a family at all. Dropping is visible: the count of parsed careers is what the comparison
    /// records, and a cache row that parses to zero careers becomes a LEGACY_LOCKED pair.</item>
    /// </list>
    /// It does NOT invent a cluster from the title, and it does not guess a score from the ordinal
    /// position: both would manufacture legacy evidence that legacy did not produce.
    /// </summary>
    public static LegacyCareerRanking Parse(string userId, string? careerMatchesJson, DateTimeOffset? observedAt = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(userId);
        if (string.IsNullOrWhiteSpace(careerMatchesJson))
        {
            return LockedFor(userId, observedAt);
        }

        JsonElement root;
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(careerMatchesJson);
        }
        catch (JsonException)
        {
            // An unparseable cache row is legacy having written something this reader does not
            // understand. That is a fact about the cohort, not a reason to fail the whole job.
            return LockedFor(userId, observedAt);
        }

        using (document)
        {
            root = document.RootElement;
            var locked = false;
            var array = root;

            if (root.ValueKind == JsonValueKind.Object)
            {
                if (TryGetProperty(root, "locked", out var lockedElement)
                    && lockedElement.ValueKind == JsonValueKind.True)
                {
                    locked = true;
                }

                if (!TryGetFirstArray(root, out array))
                {
                    return LockedFor(userId, observedAt);
                }
            }

            if (array.ValueKind != JsonValueKind.Array)
            {
                return LockedFor(userId, observedAt);
            }

            var careers = new List<LegacyCareerScore>(array.GetArrayLength());
            foreach (var item in array.EnumerateArray())
            {
                if (TryParseCareer(item, out var career))
                {
                    careers.Add(career);
                }
            }

            return careers.Count == 0
                ? LockedFor(userId, observedAt)
                : new LegacyCareerRanking(userId, locked, careers, observedAt);
        }
    }

    private static bool TryGetFirstArray(JsonElement root, out JsonElement array)
    {
        foreach (var name in (string[])["careers", "careerMatches", "matches"])
        {
            if (TryGetProperty(root, name, out var candidate) && candidate.ValueKind == JsonValueKind.Array)
            {
                array = candidate;
                return true;
            }
        }

        array = default;
        return false;
    }

    private static bool TryParseCareer(JsonElement item, out LegacyCareerScore career)
    {
        career = null!;
        if (item.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        var cluster = ReadString(item, "cluster") ?? ReadString(item, "clusterName");
        if (string.IsNullOrWhiteSpace(cluster))
        {
            return false;
        }

        if ((ReadDouble(item, "totalScore") ?? ReadDouble(item, "score")) is not double score)
        {
            return false;
        }

        career = new LegacyCareerScore(
            ProgramId: ReadString(item, "programId") ?? string.Empty,
            ProgramTitle: ReadString(item, "programTitle") ?? ReadString(item, "title") ?? string.Empty,
            Cluster: cluster.Trim(),
            TotalScore: score);
        return true;
    }

    private static bool TryGetProperty(JsonElement element, string name, out JsonElement value)
    {
        if (element.TryGetProperty(name, out value))
        {
            return true;
        }

        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        value = default;
        return false;
    }

    private static string? ReadString(JsonElement element, string name) =>
        TryGetProperty(element, name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static double? ReadDouble(JsonElement element, string name)
    {
        if (!TryGetProperty(element, name, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number when value.TryGetDouble(out var number) => number,
            JsonValueKind.String when double.TryParse(
                value.GetString(), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => null,
        };
    }
}

/// <summary>Reads a student's cached legacy /careers/score answer under the caller's RLS session.</summary>
public interface ILegacyCareerScoreReader
{
    /// <summary>
    /// The student's <c>user_career_profiles</c> row parsed into a <see cref="LegacyCareerRanking"/>, or
    /// null when the row does not exist OR is not visible to this session. The two are the same outcome
    /// here for the reason CareerFitRunReader gives: distinguishing them hands a caller a probe.
    /// </summary>
    Task<LegacyCareerRanking?> ReadAsync(
        Auth.RequestContext context, string userId, CancellationToken cancellationToken = default);
}
