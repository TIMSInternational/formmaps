using System.Globalization;
using System.Text.Json;
using FormMaps.Application.SchoolAnalytics;

namespace FormMaps.Application.Counselor;

/// <summary>
/// Pure port of counselorAnalyticsService.listEnrichedStudents' enrichment (FM-DOTNET-068): from the raw
/// <see cref="CaseloadData"/> bundle, computes per-student GPA / credit progress / assessment badges / at-risk status
/// / career path, then applies the search + status filters, the sort (name via JS localeCompare = ICU
/// InvariantCulture; gpa/alertCount/gradeLevel numeric), and pagination. No I/O — unit-testable.
/// </summary>
public static class EnrichedCaseloadComputer
{
    private static readonly string[] ExamTypes =
        ["PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation"];

    // GRADE_POINTS — only these labels contribute to GPA (an unmapped label is skipped, matching the TS map lookup).
    private static readonly Dictionary<string, double> GradePoints = new(StringComparer.Ordinal)
    {
        ["A"] = 4, ["A-"] = 3.7, ["B+"] = 3.3, ["B"] = 3, ["B-"] = 2.7,
        ["C+"] = 2.3, ["C"] = 2, ["C-"] = 1.7, ["D"] = 1, ["F"] = 0,
    };

    private const string Completed = "completed";
    private const string InProgress = "in_progress";
    private const string NotStarted = "not_started";

    // JS localeCompare parity for the name sort (both stacks ICU-backed) — see the regression-corpus localeCompare rule.
    private static readonly CompareInfo Icu = CultureInfo.InvariantCulture.CompareInfo;

    public static EnrichedCaseloadResult Compute(CaseloadData data, EnrichedCaseloadOptions opts)
    {
        if (data.Students.Count == 0)
        {
            return new EnrichedCaseloadResult([], 0, opts.Page, opts.Limit, 0);
        }

        // GPA points + earned credits per student (credit fallback: own credits > 0 else the course's catalog credits).
        var gpaPoints = new Dictionary<string, List<double>>(StringComparer.Ordinal);
        var creditsEarned = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var g in data.Grades)
        {
            if (GradePoints.TryGetValue((g.Grade ?? string.Empty).Trim(), out var pts))
            {
                if (!gpaPoints.TryGetValue(g.StudentId, out var list))
                {
                    gpaPoints[g.StudentId] = list = [];
                }

                list.Add(pts);
            }

            var cr = g.Credits > 0 ? g.Credits : data.CourseCredits.GetValueOrDefault(g.CourseId, 0);
            creditsEarned[g.StudentId] = creditsEarned.GetValueOrDefault(g.StudentId, 0) + cr;
        }

        // LIA (PCA exam session) completion: distinct completed exam types + a "started" flag.
        var liaByUser = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        var liaStarted = new HashSet<string>(StringComparer.Ordinal);
        foreach (var s in data.PcaSessions)
        {
            liaStarted.Add(s.UserId);
            if (s.Status != "Completed")
            {
                continue;
            }

            if (!liaByUser.TryGetValue(s.UserId, out var set))
            {
                liaByUser[s.UserId] = set = new HashSet<string>(StringComparer.Ordinal);
            }

            set.Add(s.ExamType);
        }

        // 360 eval totals/completed per evaluated user.
        var evalByUser = new Dictionary<string, (int Total, int Completed)>(StringComparer.Ordinal);
        foreach (var g in data.EvalGroups)
        {
            evalByUser.TryGetValue(g.EvaluatedUserId, out var e);
            evalByUser[g.EvaluatedUserId] = (e.Total + 1, e.Completed + (g.IsCompleted ? 1 : 0));
        }

        var pcaDone = new HashSet<string>(data.PcaEvals.Where(e => e.IsCompleted).Select(e => e.UserId), StringComparer.Ordinal);
        var pcaStarted = new HashSet<string>(data.PcaEvals.Select(e => e.UserId), StringComparer.Ordinal);
        var careerByUser = BuildCareerByUser(data.Profiles);
        var personalityDone = new HashSet<string>(data.PersonalityCompletedUserIds, StringComparer.Ordinal);

        var enriched = new List<EnrichedStudent>(data.Students.Count);
        foreach (var s in data.Students)
        {
            var pts = gpaPoints.GetValueOrDefault(s.Id);
            double? gpa = pts is { Count: > 0 } ? Round2(pts.Sum() / pts.Count) : null;
            var earned = Round2(creditsEarned.GetValueOrDefault(s.Id, 0));

            var liaCount = liaByUser.GetValueOrDefault(s.Id)?.Count ?? 0;
            var lia = liaCount >= ExamTypes.Length ? Completed
                : (liaCount > 0 || liaStarted.Contains(s.Id)) ? InProgress : NotStarted;
            var pca = pcaDone.Contains(s.Id) ? Completed : pcaStarted.Contains(s.Id) ? InProgress : NotStarted;

            string eval360;
            if (evalByUser.TryGetValue(s.Id, out var ev) && ev.Total > 0)
            {
                // legacy: completed >= min(total,3) → completed; else in_progress (the completed>0?in_progress:in_progress
                // branch collapses to in_progress).
                eval360 = ev.Completed >= Math.Min(ev.Total, 3) ? Completed : InProgress;
            }
            else
            {
                eval360 = NotStarted;
            }

            var personality = personalityDone.Contains(s.Id) ? Completed : NotStarted;

            var alertCount = data.AlertCounts.GetValueOrDefault(s.Id, 0);
            var status = !s.IsActive ? "inactive"
                : ((gpa is not null && gpa < 2.5) || alertCount > 0) ? "at_risk" : "active";

            var percentage = data.CreditsRequired > 0
                ? (int)Math.Min(100, SchoolAnalyticsMath.JsRound(earned / data.CreditsRequired * 100))
                : 0;

            enriched.Add(new EnrichedStudent(
                Id: s.Id, Name: s.Name, Email: s.Email, GradeLevel: s.GradeLevel, IsActive: s.IsActive,
                CreatedAt: s.CreatedAt, Status: status, Gpa: gpa,
                CreditProgress: new CreditProgress(earned, data.CreditsRequired, percentage),
                Lia: lia, Pca: pca, Eval360: eval360, Personality: personality,
                CareerPath: careerByUser.GetValueOrDefault(s.Id), AlertCount: alertCount));
        }

        IEnumerable<EnrichedStudent> filtered = enriched;
        if (!string.IsNullOrEmpty(opts.Search))
        {
            var q = opts.Search.ToLowerInvariant();
            // Legacy does s.name.toLowerCase()/s.email — a null would NRE (500). We guard null→"" (safe superset;
            // pathological only, names/emails are populated for a caseload).
            filtered = filtered.Where(s =>
                (s.Name ?? string.Empty).ToLowerInvariant().Contains(q) ||
                (s.Email ?? string.Empty).ToLowerInvariant().Contains(q));
        }

        if (!string.IsNullOrEmpty(opts.Status))
        {
            filtered = filtered.Where(s => s.Status == opts.Status);
        }

        var sorted = SortEnriched(filtered, opts.SortBy, opts.SortOrder);

        var total = sorted.Count;
        var start = (opts.Page - 1) * opts.Limit;
        var pageRows = start >= total || start < 0
            ? []
            : sorted.Skip(start).Take(opts.Limit).ToList();
        var totalPages = (int)Math.Ceiling((double)total / opts.Limit);

        return new EnrichedCaseloadResult(pageRows, total, opts.Page, opts.Limit, totalPages);
    }

    // Stable sort (OrderBy) matching the JS comparator * dir. name → ICU localeCompare; others → numeric key.
    private static List<EnrichedStudent> SortEnriched(
        IEnumerable<EnrichedStudent> rows, string? sortBy, string? sortOrder)
    {
        var desc = sortOrder == "desc";
        var key = string.IsNullOrEmpty(sortBy) ? "name" : sortBy;

        return key switch
        {
            "gpa" => Ordered(rows, s => s.Gpa ?? -1, desc),
            "alertCount" => Ordered(rows, s => (double)s.AlertCount, desc),
            "gradeLevel" => Ordered(rows, s => (double)(s.GradeLevel ?? 0), desc),
            _ => desc
                ? rows.OrderByDescending(s => s.Name ?? string.Empty, NameComparer).ToList()
                : rows.OrderBy(s => s.Name ?? string.Empty, NameComparer).ToList(),
        };
    }

    private static List<EnrichedStudent> Ordered(
        IEnumerable<EnrichedStudent> rows, Func<EnrichedStudent, double> key, bool desc) =>
        (desc ? rows.OrderByDescending(key) : rows.OrderBy(key)).ToList();

    private static readonly IComparer<string> NameComparer =
        Comparer<string>.Create((a, b) => Icu.Compare(a, b, CompareOptions.None));

    private static Dictionary<string, string> BuildCareerByUser(IReadOnlyList<CaseloadProfile> profiles)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var p in profiles)
        {
            var name = TopCareerName(p.CareerMatchesJson);
            if (name is not null)
            {
                map[p.UserId] = name;
            }
        }

        return map;
    }

    // careerMatches[0] name precedence: name || careerName || cluster || clusterName (JS `||` — empty string is falsy).
    private static string? TopCareerName(string careerMatchesJson)
    {
        if (string.IsNullOrEmpty(careerMatchesJson))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(careerMatchesJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0)
            {
                return null;
            }

            var top = doc.RootElement[0];
            if (top.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            foreach (var prop in new[] { "name", "careerName", "cluster", "clusterName" })
            {
                if (top.TryGetProperty(prop, out var value) &&
                    value.ValueKind == JsonValueKind.String &&
                    !string.IsNullOrEmpty(value.GetString()))
                {
                    return value.GetString();
                }
            }

            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    // Math.round(x*100)/100 with V8 semantics (round half toward +∞).
    private static double Round2(double x) => SchoolAnalyticsMath.JsRound(x * 100) / 100;
}
