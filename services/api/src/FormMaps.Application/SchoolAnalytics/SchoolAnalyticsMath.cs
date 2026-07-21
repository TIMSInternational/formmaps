using System.Globalization;

namespace FormMaps.Application.SchoolAnalytics;

/// <summary>
/// Pure, DB-free port of the school-analytics arithmetic in schoolService.ts (getAnalyticsOverview /
/// getAnalyticsTrends / getTopPerformers). Isolated here so the letter-grade→GPA mapping, the progress-score
/// rounding, the at-risk boundary, and the date-bucketing are golden-pinnable without a database.
///
/// <para><b>Rounding.</b> Every score/rate uses JS <c>Math.round</c> (ties toward +∞), NOT .NET
/// <c>Math.Round</c> (banker's ToEven). All inputs here are ≥ 0. <see cref="JsRound"/> reproduces V8 exactly
/// (a mean of x.5 rounds UP), which banker's rounding would get wrong on the even-integer side.</para>
///
/// <para><b>UTC bucketing (TZ landmine).</b> The legacy code buckets with <c>Date.setHours(0,0,0,0)</c>
/// (SERVER-LOCAL midnight) and labels with <c>toISOString().slice(0,10)</c> (UTC date). Prod Node runs on
/// App Runner in UTC and this .NET service runs in UTC, so the two coincide and we port both as UTC. The caller
/// MUST pass a UTC-kind "now"; <see cref="ComputeBuckets"/> derives the bucket midnights from <c>now.Date</c>
/// (UTC) and formats UTC date labels. If either runtime were ever non-UTC the buckets would shift — they are not.
/// A single captured <c>DateTime.UtcNow</c> feeds BOTH the range start filter and the bucket "now" (legacy uses
/// two <c>new Date()</c> a few ms apart; one instant is strictly more consistent).</para>
/// </summary>
public static class SchoolAnalyticsMath
{
    /// <summary>
    /// GRADE_MAP (schoolService.ts:511) — exact. Ordinal keys; the grade is <c>.Trim()</c>-ed before lookup and
    /// an unknown/empty grade is SKIPPED (contributes no point), never treated as 0.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, double> GradeMap = new Dictionary<string, double>(StringComparer.Ordinal)
    {
        ["A"] = 4.0,
        ["A-"] = 3.7,
        ["B+"] = 3.3,
        ["B"] = 3.0,
        ["B-"] = 2.7,
        ["C+"] = 2.3,
        ["C"] = 2.0,
        ["C-"] = 1.7,
        ["D"] = 1.0,
        ["F"] = 0.0,
    };

    /// <summary>The at-risk threshold: a student whose per-student mean GPA is &lt; 2.0 (schoolService.ts:727).</summary>
    public const double AtRiskThreshold = 2.0;

    /// <summary>
    /// GRADE_MAP[grade?.trim() || ""] — returns the mapped point, or null when the trimmed grade is unknown/empty
    /// (JS <c>undefined</c> → the point is skipped by the caller).
    /// </summary>
    public static double? MapGrade(string? grade)
    {
        var key = (grade ?? string.Empty).Trim();
        return GradeMap.TryGetValue(key, out var value) ? value : null;
    }

    /// <summary>
    /// Byte-exact JS <c>Math.round</c> for a non-negative double: the integer closest to x, ties toward +∞.
    /// <c>x - Floor(x)</c> is the exact fractional part, so this avoids BOTH .NET banker's rounding AND the
    /// <c>Math.Floor(x + 0.5)</c> ULP artifact. (Same helper as VocationalScoring.)
    /// </summary>
    public static double JsRound(double x)
    {
        var floor = Math.Floor(x);
        return (x - floor) >= 0.5 ? floor + 1 : floor;
    }

    /// <summary>
    /// Mean of a non-empty point list, summed left-to-right to match JS <c>reduce((a,b)=>a+b,0)/length</c>.
    /// </summary>
    public static double Mean(IReadOnlyList<double> points)
    {
        double sum = 0;
        for (var i = 0; i < points.Count; i++)
        {
            sum += points[i];
        }

        return sum / points.Count;
    }

    /// <summary>
    /// progressScore for a single GPA: <c>Math.round(gpa * 25 * 10) / 10</c> (1-dp, GPA-0..4 → 0..100 scale).
    /// Used for both top-performers' per-student score and overview's averageProgressScore (fed the mean-of-means).
    /// </summary>
    public static double ProgressScore(double gpa) => JsRound(gpa * 25 * 10) / 10;

    /// <summary>
    /// Aggregate raw (studentId, grade) rows into the overview's GPA-derived fields. Mirrors getAnalyticsOverview:
    /// group mapped points per student (skipping unmapped grades, preserving first-seen student order like a JS Map),
    /// then per student take the mean → sum into totalGpa (gpaCount++), count means &lt; 2.0 as at-risk. A student
    /// with zero MAPPED grades contributes nothing (not counted in gpaCount / at-risk). averageProgressScore is
    /// <c>gpaCount &gt; 0 ? ProgressScore(totalGpa / gpaCount) : 0</c>.
    /// </summary>
    public static GpaAggregate AggregateGpa(IEnumerable<(string StudentId, string? Grade)> rows)
    {
        var order = new List<string>();
        var byStudent = new Dictionary<string, List<double>>(StringComparer.Ordinal);
        foreach (var (studentId, grade) in rows)
        {
            var value = MapGrade(grade);
            if (value is null)
            {
                continue;
            }

            if (!byStudent.TryGetValue(studentId, out var list))
            {
                list = [];
                byStudent[studentId] = list;
                order.Add(studentId);
            }

            list.Add(value.Value);
        }

        double totalGpa = 0;
        var gpaCount = 0;
        var studentsAtRisk = 0;
        foreach (var studentId in order)
        {
            var mean = Mean(byStudent[studentId]);
            totalGpa += mean;
            gpaCount++;
            if (mean < AtRiskThreshold)
            {
                studentsAtRisk++;
            }
        }

        var averageProgressScore = gpaCount > 0 ? ProgressScore(totalGpa / gpaCount) : 0;
        return new GpaAggregate(averageProgressScore, studentsAtRisk, gpaCount);
    }

    /// <summary>range → day window: 90d→90, 1y→365, everything else (incl. "30d"/unknown)→30 (schoolService.ts:744).</summary>
    public static int DaysForRange(string? range) => range switch
    {
        "90d" => 90,
        "1y" => 365,
        _ => 30,
    };

    /// <summary>step = max(1, floor(days / 12)) (schoolService.ts:781) — integer floor division.</summary>
    public static int StepForDays(int days) => Math.Max(1, days / 12);

    /// <summary>
    /// Port of the trends bucketing loop (schoolService.ts:779-791). <paramref name="nowUtc"/> MUST be UTC-kind.
    /// step = StepForDays(days); for (i = days-1; i &gt;= 0; i -= step): bucketStart = UTC-midnight of (now − i days),
    /// bucketEnd = bucketStart + step days, label = bucketStart "yyyy-MM-dd", value = count of events in the
    /// HALF-OPEN interval [bucketStart, bucketEnd). Events are compared by tick value (Kind-agnostic), so DB
    /// timestamps read as Unspecified (UTC wall-clock in prod) bucket correctly against the UTC-derived edges.
    /// </summary>
    public static TrendBuckets ComputeBuckets(DateTime nowUtc, int days, IReadOnlyList<DateTime> events)
    {
        var labels = new List<string>();
        var values = new List<int>();
        var step = StepForDays(days);
        var baseMidnight = DateTime.SpecifyKind(nowUtc.Date, DateTimeKind.Utc);
        for (var i = days - 1; i >= 0; i -= step)
        {
            var bucketStart = baseMidnight.AddDays(-i);
            var bucketEnd = bucketStart.AddDays(step);
            labels.Add(bucketStart.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));

            var count = 0;
            for (var e = 0; e < events.Count; e++)
            {
                var when = events[e];
                if (when >= bucketStart && when < bucketEnd)
                {
                    count++;
                }
            }

            values.Add(count);
        }

        return new TrendBuckets(labels, values);
    }
}

/// <summary>overview GPA-derived fields (see <see cref="SchoolAnalyticsMath.AggregateGpa"/>).</summary>
public sealed record GpaAggregate(double AverageProgressScore, int StudentsAtRisk, int GpaCount);

/// <summary>trends bucketing output (parallel label/value lists).</summary>
public sealed record TrendBuckets(IReadOnlyList<string> Labels, IReadOnlyList<int> Values);
