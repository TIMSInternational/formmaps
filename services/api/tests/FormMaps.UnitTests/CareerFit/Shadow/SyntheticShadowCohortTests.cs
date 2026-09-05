using System.Globalization;
using System.Text;
using System.Text.Json;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Application.CareerFit.Shadow;
using Xunit;

namespace FormMaps.UnitTests.CareerFit.Shadow;

/// <summary>
/// FM-CF-013. Builds a deterministic SYNTHETIC shadow cohort through the real comparator and holds the
/// committed export fixture to it, byte for byte.
/// </summary>
/// <remarks>
/// <para>
/// WHY THIS EXISTS. The report generator (<c>tools/careerfit/shadow_report.py</c>) has to be runnable and
/// reviewable before a real cohort exists, and a report generated from a hand-written JSON file would be
/// a report about a hand-written JSON file. So the fixture it is demonstrated on is produced by the
/// SAME classifier that will produce the real rows: constructed pairs → <c>CareerFitShadowComparator</c> →
/// the export shape a psql COPY of the table emits. Nothing in the chain is a second implementation of
/// the metrics or of the classification, which is the failure mode this whole slice is trying to avoid.
/// </para>
/// <para>
/// IT IS SYNTHETIC AND IT IS LABELLED SYNTHETIC. Every row's user id is <c>synthetic-…</c>, the fixture's
/// filename says so, and the generated report's title says so. These numbers describe a classifier's
/// behaviour on constructed inputs; they say nothing about the engine's agreement with the legacy scorer,
/// and no reader should ever quote them as if they did.
/// </para>
/// <para>
/// REGENERATING. Set <c>CAREERFIT_SHADOW_EXPORT</c> to the fixture path and run this class; with the
/// variable unset the test asserts equality instead, which is the same discipline the FM-CF-004 parity
/// fixture follows (if the C# and the fixture disagree, regenerate deliberately and read the diff).
/// </para>
/// </remarks>
public sealed class SyntheticShadowCohortTests
{
    /// <summary>Repo-relative path of the committed export the report generator is demonstrated on.</summary>
    public const string FixturePath = "docs/careerfit/shadow/synthetic-shadow-cohort.ndjson";

    /// <summary>Every cause the classifier can reach appears in the cohort, so the report exercises every branch.</summary>
    [Fact]
    public void The_synthetic_cohort_exercises_every_cause_the_classifier_can_reach()
    {
        var cohort = Build();
        var causes = cohort.Select(c => c.PrimaryCause).ToHashSet();

        // TaxonomyNoLegacyEvidence and NameJoin/InputCoverage/Tie/Unexplained are family-level and only
        // become a PRIMARY cause when they dominate a pair; all five do in this cohort by construction.
        foreach (var expected in (CareerFitShadowCause[])[
            CareerFitShadowCause.Agreement,
            CareerFitShadowCause.LegacyLocked,
            CareerFitShadowCause.EngineNotScorable,
            CareerFitShadowCause.TaxonomyUnmapped,
            CareerFitShadowCause.TaxonomyNoLegacyEvidence,
            CareerFitShadowCause.InputCoverage,
            CareerFitShadowCause.NameJoin,
            CareerFitShadowCause.Tie,
            CareerFitShadowCause.Unexplained])
        {
            Assert.Contains(expected, causes);
        }
    }

    /// <summary>
    /// The committed fixture is exactly what this build's comparator produces. A change to the comparator
    /// that moves a number therefore fails HERE, with a diff, rather than silently changing every report
    /// generated afterwards.
    /// </summary>
    [Fact]
    public void The_committed_export_fixture_is_what_this_builds_comparator_produces()
    {
        var ndjson = ToNdjson(Build());
        var path = Environment.GetEnvironmentVariable("CAREERFIT_SHADOW_EXPORT");

        if (!string.IsNullOrWhiteSpace(path))
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
            File.WriteAllText(path, ndjson);
            return;
        }

        var fixture = Path.Combine(RepositoryRoot(), FixturePath);
        Assert.True(File.Exists(fixture), $"Missing {FixturePath}. Regenerate with CAREERFIT_SHADOW_EXPORT=<path>.");
        Assert.Equal(File.ReadAllText(fixture).ReplaceLineEndings("\n"), ndjson);
    }

    /// <summary>
    /// Every exported line carries the two version stamps. A cohort measured under two comparators or two
    /// projections must never be averaged together silently, and the report can only refuse to do that if
    /// every row says which it was.
    /// </summary>
    [Fact]
    public void Every_exported_row_states_the_comparator_and_projection_it_was_measured_under()
    {
        foreach (var line in ToNdjson(Build()).Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            using var document = JsonDocument.Parse(line);
            Assert.Equal("v1", document.RootElement.GetProperty("comparator_version").GetString());
            Assert.Equal("synthetic-complete-v0", document.RootElement.GetProperty("projection_version").GetString());
        }
    }

    // ------------------------------------------------------------------ the cohort

    private static readonly CareerFitShadowProjection Projection = Complete();
    private static readonly IReadOnlyDictionary<int, IReadOnlyList<int>> AllCompetencies = ShadowPairs.FamilyCompetencies();

    private static CareerFitShadowProjection Complete()
    {
        var clusters = string.Join(",\n", ShadowPairs.ScorableFamilies.Select(id =>
            $$"""    "Cluster_{{id}}": { "family_id": {{id}}, "evidence": "synthetic" }"""));

        return CareerFitShadowProjection.Parse($$"""
            {
              "projection_version": "synthetic-complete-v0",
              "status": "SYNTHETIC_FOR_TESTS",
              "minimum_families_for_comparison": 3,
              "clusters": {
            {{clusters}}
              }
            }
            """);
    }

    /// <summary>
    /// Twenty-four constructed students, each built to land in one bucket. The shifts are chosen, not
    /// sampled: a bucket that went green for the wrong reason would be indistinguishable from one that
    /// went green for the right one if these were random.
    /// </summary>
    internal static IReadOnlyList<CareerFitShadowComparison> Build()
    {
        var cohort = new List<CareerFitShadowComparison>();
        var absolutes = ShadowPairs.DescendingAbsolutes();

        // Six students the two engines agree about, with legacy's scores progressively noisier so the
        // report has a distribution to summarise rather than six identical 1.0s.
        for (var i = 0; i < 6; i++)
        {
            var jitter = i;
            var legacy = ShadowPairs.Legacy([.. ShadowPairs.ScorableFamilies.Select(id =>
                ($"Cluster_{id}", absolutes[id] + (id % (jitter + 2) == 0 ? 0.4 : 0.0)))]);
            cohort.Add(Named($"synthetic-agree-{i:D2}", Compare(absolutes, legacy)));
        }

        // Four with one family moved far, everything measured: the UNEXPLAINED bucket.
        for (var i = 0; i < 4; i++)
        {
            var moved = 14 - i;
            var legacy = ShadowPairs.Legacy([.. ShadowPairs.ScorableFamilies.Select(id =>
                ($"Cluster_{id}", id == moved ? 99.0 : absolutes[id]))]);
            cohort.Add(Named($"synthetic-unexplained-{i:D2}", Compare(absolutes, legacy)));
        }

        // Three whose moved family scores a competency the report did not carry.
        for (var i = 0; i < 3; i++)
        {
            var moved = 12 + i;
            var legacy = ShadowPairs.Legacy([.. ShadowPairs.ScorableFamilies.Select(id =>
                ($"Cluster_{id}", id == moved ? 99.0 : absolutes[id]))]);
            cohort.Add(Named($"synthetic-coverage-{i:D2}", CareerFitShadowComparator.Compare(
                ShadowPairs.Run(absolutes, ShadowPairs.DefaultedQuality(7, 11)),
                legacy, Projection, ShadowPairs.FamilyCompetencies((moved, [7, 11])))));
        }

        // Two where the defaulted ids exist because a printed name joined nothing.
        for (var i = 0; i < 2; i++)
        {
            var moved = 10 + i;
            var legacy = ShadowPairs.Legacy([.. ShadowPairs.ScorableFamilies.Select(id =>
                ($"Cluster_{id}", id == moved ? 99.0 : absolutes[id]))]);
            cohort.Add(Named($"synthetic-namejoin-{i:D2}", CareerFitShadowComparator.Compare(
                ShadowPairs.Run(absolutes, ShadowPairs.DefaultedQuality(7).WithUnknownNames("COMPETENCIA NO CATALOGADA")),
                legacy, Projection, ShadowPairs.FamilyCompetencies((moved, [7])))));
        }

        // Two whose legacy side ties the engine's last two families jointly first.
        for (var i = 0; i < 2; i++)
        {
            var legacy = ShadowPairs.Legacy([.. ShadowPairs.ScorableFamilies.Select(id =>
                ($"Cluster_{id}", id >= 13 - i ? 99.0 : absolutes[id]))]);
            cohort.Add(Named($"synthetic-tie-{i:D2}", Compare(absolutes, legacy)));
        }

        // Two whose legacy answer says nothing about the engine's top families.
        for (var i = 0; i < 2; i++)
        {
            var legacy = ShadowPairs.Legacy([.. Enumerable.Range(3 + i, 12 - i).Select(id =>
                ($"Cluster_{id}", absolutes[id]))]);
            cohort.Add(Named($"synthetic-noevidence-{i:D2}", Compare(absolutes, legacy)));
        }

        // Two whose legacy clusters the projection does not assign at all.
        for (var i = 0; i < 2; i++)
        {
            var legacy = ShadowPairs.Legacy(("Unmapped_A", 90.0), ("Unmapped_B", 80.0), ($"Cluster_{1 + i}", 70.0));
            cohort.Add(Named($"synthetic-unmapped-{i:D2}", Compare(absolutes, legacy)));
        }

        // Two legacy had no usable answer for, and one the engine refused to score.
        cohort.Add(Named("synthetic-locked-00", Compare(absolutes, LegacyCareerRanking.LockedFor("student-1"))));
        cohort.Add(Named("synthetic-locked-01", Compare(absolutes, LegacyCareerRanking.LockedFor("student-1"))));
        cohort.Add(Named("synthetic-notscorable-00", CareerFitShadowComparator.NotComparable(
            "student-1", "school-a", CareerFitShadowCause.EngineNotScorable,
            Projection.Version, "1.0.0-draft.1",
            legacyObservedAt: new DateTimeOffset(2026, 9, 1, 0, 0, 0, TimeSpan.Zero),
            note: "The engine refused to score this student: instrument MIL, code MIL_SUBTEST_MISSING. "
                + "Legacy had an answer for them.")));

        return cohort;
    }

    private static CareerFitShadowComparison Compare(
        IReadOnlyDictionary<int, double> absolutes, LegacyCareerRanking legacy) =>
        CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes, ShadowPairs.CleanQuality().WithNoV360()),
            legacy, Projection, AllCompetencies);

    private static CareerFitShadowComparison Named(string userId, CareerFitShadowComparison comparison) =>
        comparison with { UserId = userId };

    // ------------------------------------------------------------------ the export shape

    /// <summary>
    /// One JSON object per line, exactly the keys the runbook's psql COPY emits (see
    /// docs/careerfit/careerfit-shadow-report.md). The generator reads this shape and no other, so a
    /// change to either has to be made in both and this test is what notices.
    /// </summary>
    internal static string ToNdjson(IReadOnlyList<CareerFitShadowComparison> cohort)
    {
        var builder = new StringBuilder();
        var createdAt = new DateTimeOffset(2026, 9, 4, 12, 0, 0, TimeSpan.Zero);

        foreach (var comparison in cohort)
        {
            using var buffer = new MemoryStream();
            using (var writer = new Utf8JsonWriter(buffer))
            {
                writer.WriteStartObject();
                writer.WriteString("user_id", comparison.UserId);
                writer.WriteString("school_id", comparison.SchoolId);
                writer.WriteBoolean("comparable", comparison.Comparable);
                writer.WriteString("primary_cause", comparison.PrimaryCause.ToPersistedValue());

                if (comparison.SpearmanRho is double rho)
                {
                    writer.WriteNumber("spearman_rho", rho);
                }
                else
                {
                    writer.WriteNull("spearman_rho");
                }

                if (comparison.TopThreeOverlap is int overlap)
                {
                    writer.WriteNumber("top_three_overlap", overlap);
                }
                else
                {
                    writer.WriteNull("top_three_overlap");
                }

                writer.WriteString("rules_version", comparison.RulesVersion);
                writer.WriteString("comparator_version", comparison.ComparatorVersion);
                writer.WriteString("projection_version", comparison.ProjectionVersion);

                if (comparison.DiscGraph is DiscGraphChoice graph)
                {
                    writer.WriteNumber("disc_graph", (int)graph);
                }
                else
                {
                    writer.WriteNull("disc_graph");
                }

                writer.WriteString(
                    "legacy_observed_at",
                    comparison.LegacyObservedAt?.ToString("O", CultureInfo.InvariantCulture));
                writer.WriteString("created_at", createdAt.ToString("O", CultureInfo.InvariantCulture));
                writer.WritePropertyName("engine_ranking");
                writer.WriteRawValue(CareerFitShadowJson.SerializeRanking(comparison.EngineRanking));
                writer.WritePropertyName("legacy_ranking");
                writer.WriteRawValue(CareerFitShadowJson.SerializeRanking(comparison.LegacyRanking));
                writer.WritePropertyName("delta");
                writer.WriteRawValue(CareerFitShadowJson.SerializeDelta(comparison));
                writer.WriteEndObject();
            }

            builder.Append(Encoding.UTF8.GetString(buffer.ToArray())).Append('\n');
        }

        return builder.ToString();
    }

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName, "docs", "careerfit")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName
            ?? throw new InvalidOperationException("Could not locate the repository root from the test assembly.");
    }
}
