using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Shadow;
using FormMaps.Infrastructure.CareerFit;
using Xunit;

namespace FormMaps.UnitTests.CareerFit.Shadow;

/// <summary>
/// FM-CF-013. The two inputs the comparison is built out of: the cached legacy answer as the platform
/// actually stores it, and the cluster → family projection.
/// </summary>
/// <remarks>
/// The legacy shape is read off <c>apps/web/src/types/tims.ts</c> (ScoredCareer / ScoreCareersResponse)
/// and off the two existing .NET readers of the same column (<c>CounselorCaseloadReader</c>,
/// <c>CoursePlanComputeReader</c>), which already have to cope with both an array and an object document.
/// The parser's tolerance is enumerated in <see cref="LegacyCareerRanking.Parse"/> and each admitted
/// variant is pinned here; every rejection is pinned too, because a parser that quietly invented a
/// cluster or a score would manufacture legacy evidence legacy never produced.
/// </remarks>
public sealed class CareerFitShadowInputsTests
{
    // ---------------------------------------------------------------- the legacy cache

    /// <summary>The plain array shape: legacy's own careerMatches, keys as ScoredCareer spells them.</summary>
    [Fact]
    public void A_plain_array_of_scored_careers_parses_in_the_order_it_was_stored()
    {
        var ranking = LegacyCareerRanking.Parse("student-1", """
            [
              {"programId":"SOC-021","programTitle":"Sociology","cluster":"Social_and_Behavioral_Sciences","totalScore":78.5},
              {"programId":"ENG-004","programTitle":"Civil","cluster":"Engineering","totalScore":61}
            ]
            """);

        Assert.False(ranking.Locked);
        Assert.Equal(2, ranking.Careers.Count);
        Assert.Equal("SOC-021", ranking.Careers[0].ProgramId);
        Assert.Equal("Social_and_Behavioral_Sciences", ranking.Careers[0].Cluster);
        Assert.Equal(78.5, ranking.Careers[0].TotalScore);
    }

    /// <summary>The object shape, under any of the three names the platform's own readers already accept.</summary>
    [Theory]
    [InlineData("careers")]
    [InlineData("careerMatches")]
    [InlineData("matches")]
    public void An_object_document_parses_through_the_array_it_carries(string key)
    {
        var ranking = LegacyCareerRanking.Parse("student-1",
            $$"""{"{{key}}":[{"cluster":"Engineering","totalScore":61}],"profileSummary":"…"}""");

        Assert.Single(ranking.Careers);
        Assert.Equal("Engineering", ranking.Careers[0].Cluster);
    }

    /// <summary>Legacy's own locked answer stays locked, whatever else the document carries.</summary>
    [Fact]
    public void A_locked_document_is_locked_even_when_it_carries_careers()
    {
        var ranking = LegacyCareerRanking.Parse("student-1",
            """{"locked":true,"careers":[{"cluster":"Engineering","totalScore":61}]}""");

        Assert.True(ranking.Locked);
    }

    /// <summary>
    /// An entry with no cluster is DROPPED, never given one. A cluster is the only field the projection can
    /// use, and inferring one from the programme title would be a second, worse taxonomy invented inside a
    /// parser.
    /// </summary>
    [Fact]
    public void An_entry_with_no_cluster_is_dropped_rather_than_inferred_from_its_title()
    {
        var ranking = LegacyCareerRanking.Parse("student-1", """
            [
              {"programTitle":"Civil Engineering","totalScore":61},
              {"cluster":"Engineering","totalScore":55}
            ]
            """);

        Assert.Single(ranking.Careers);
        Assert.Equal(55, ranking.Careers[0].TotalScore);
    }

    /// <summary>An entry with no score is dropped too: the ordinal position is not a score to borrow.</summary>
    [Fact]
    public void An_entry_with_no_score_is_dropped_rather_than_scored_from_its_position()
    {
        var ranking = LegacyCareerRanking.Parse("student-1", """[{"cluster":"Engineering"}]""");
        Assert.True(ranking.Locked);
        Assert.Empty(ranking.Careers);
    }

    /// <summary>An empty, absent or unparseable cache row is a locked pair, not an exception that stops a cohort.</summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("[]")]
    [InlineData("not json at all")]
    [InlineData("{\"careers\":\"nonsense\"}")]
    public void An_absent_or_unreadable_cache_row_is_a_locked_pair(string? json)
    {
        var ranking = LegacyCareerRanking.Parse("student-1", json);
        Assert.True(ranking.Locked);
        Assert.Empty(ranking.Careers);
    }

    // ---------------------------------------------------------------- the projection

    /// <summary>Cluster keys join through the SAME normaliser competency names use, so spelling variants are one cluster.</summary>
    [Theory]
    [InlineData("Social_and_Behavioral_Sciences")]
    [InlineData("social and behavioral sciences")]
    [InlineData("Social-and-Behavioral-Sciences")]
    public void Cluster_keys_join_normalised_so_separators_and_case_do_not_split_a_cluster(string spelling)
    {
        Assert.Equal(13, CareerFitShadowProjection.Embedded.Map(spelling));
    }

    /// <summary>A cluster the file does not mention maps to nothing and is NOT declared — the work list for completing it.</summary>
    [Fact]
    public void An_unknown_cluster_maps_to_nothing_and_is_not_declared()
    {
        var projection = CareerFitShadowProjection.Embedded;
        Assert.Null(projection.Map("Health_Sciences"));
        Assert.False(projection.Declares("Health_Sciences"));
        Assert.True(projection.Declares("Social_and_Behavioral_Sciences"));
    }

    /// <summary>
    /// Two spellings of one cluster are rejected at parse time rather than resolved by JSON member order,
    /// which is precisely the silent ambiguity the normaliser exists to surface.
    /// </summary>
    [Fact]
    public void A_projection_that_declares_one_cluster_twice_is_rejected()
    {
        var exception = Assert.Throws<InvalidOperationException>(() => CareerFitShadowProjection.Parse("""
            {
              "projection_version": "dup", "status": "TEST",
              "clusters": {
                "Health Sciences": { "family_id": 8 },
                "health_sciences": { "family_id": 1 }
              }
            }
            """));

        Assert.Contains("twice", exception.Message, StringComparison.Ordinal);
    }

    /// <summary>The shipped projection still agrees with the rule set this build embeds — ids and names both.</summary>
    [Fact]
    public void The_shipped_projection_agrees_with_the_embedded_rule_set()
    {
        var rules = CareerFitRulesJson.LoadEmbedded("1.0.0-draft.1");
        CareerFitShadowProjection.Embedded.AssertAgreesWith(rules);
    }

    /// <summary>
    /// And it fails loudly when it does not. A projection naming a family the rule set does not declare
    /// would put a meaningless assignment in every row it produced.
    /// </summary>
    [Fact]
    public void A_projection_naming_an_undeclared_family_is_refused_against_the_rule_set()
    {
        var rules = CareerFitRulesJson.LoadEmbedded("1.0.0-draft.1");
        var projection = CareerFitShadowProjection.Parse("""
            {"projection_version":"bad","status":"TEST","clusters":{"X":{"family_id":99}}}
            """);

        var exception = Assert.Throws<InvalidOperationException>(() => projection.AssertAgreesWith(rules));
        Assert.Contains("family 99", exception.Message, StringComparison.Ordinal);
    }

    /// <summary>A stale family NAME is refused too, so a rules bump cannot leave a wrong name in a report.</summary>
    [Fact]
    public void A_projection_carrying_a_stale_family_name_is_refused_against_the_rule_set()
    {
        var rules = CareerFitRulesJson.LoadEmbedded("1.0.0-draft.1");
        var projection = CareerFitShadowProjection.Parse("""
            {"projection_version":"stale","status":"TEST","clusters":{},"family_names":{"1":"Engineering"}}
            """);

        var exception = Assert.Throws<InvalidOperationException>(() => projection.AssertAgreesWith(rules));
        Assert.Contains("Ingeniería", exception.Message, StringComparison.Ordinal);
    }

    /// <summary>The shipped projection is INCOMPLETE and says so — the state the whole slice is honest about.</summary>
    [Fact]
    public void The_shipped_projection_declares_itself_incomplete()
    {
        Assert.True(CareerFitShadowProjection.Embedded.IsIncomplete);
        Assert.Equal(CareerFitShadowProjection.IncompleteStatus, CareerFitShadowProjection.Embedded.Status);
    }

    // ---------------------------------------------------------------- the written row

    /// <summary>
    /// The jsonb the writer sends is the shape the report generator reads: family_id / rank / evidence /
    /// tied on each side, and a delta document carrying the classified disagreements with their causes.
    /// </summary>
    [Fact]
    public void The_serialised_row_carries_both_rankings_and_the_classified_disagreements()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();
        var careers = ShadowPairs.ScorableFamilies.Select(id => ($"Cluster_{id}", id == 14 ? 99.0 : 80.0 - id)).ToArray();
        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes), ShadowPairs.Legacy(careers),
            ShadowPairs.CompleteProjection(), ShadowPairs.FamilyCompetencies());

        var engine = CareerFitShadowJson.SerializeRanking(comparison.EngineRanking);
        var delta = CareerFitShadowJson.SerializeDelta(comparison);

        Assert.StartsWith("""[{"family_id":1,"rank":1,"evidence":1,"tied":false}""", engine, StringComparison.Ordinal);
        Assert.Contains("\"cause\":\"UNEXPLAINED\"", delta, StringComparison.Ordinal);
        Assert.Contains("\"comparator_version\":\"v1\"", delta, StringComparison.Ordinal);
        Assert.Contains("\"projection_version\":\"synthetic-complete\"", delta, StringComparison.Ordinal);
    }

    /// <summary>A pair-level note (which instrument fail-closed) is PERSISTED, not logged, so a report can count it.</summary>
    [Fact]
    public void An_engine_not_scorable_pair_persists_the_instrument_that_failed_closed()
    {
        var comparison = CareerFitShadowComparator.NotComparable(
            "student-1", null, CareerFitShadowCause.EngineNotScorable, "p", "r",
            note: "The engine refused to score this student: instrument MIL, code MIL_SUBTEST_MISSING.");

        Assert.Contains("MIL_SUBTEST_MISSING", CareerFitShadowJson.SerializeDelta(comparison), StringComparison.Ordinal);
    }

    /// <summary>
    /// The reader's SQL names only the two columns it needs off the legacy cache row, and no write verb —
    /// user_career_profiles is legacy Node's table and the .NET role holds SELECT on it and nothing more.
    /// </summary>
    [Fact]
    public void The_legacy_reader_only_selects_and_only_from_the_legacy_cache_row()
    {
        var sql = typeof(LegacyCareerScoreReader)
            .GetField("SelectSql", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!
            .GetRawConstantValue() as string;

        Assert.Contains("""FROM "user_career_profiles" """.TrimEnd(), sql!, StringComparison.Ordinal);
        Assert.StartsWith("SELECT", sql!, StringComparison.Ordinal);
        foreach (var verb in (string[])["INSERT", "UPDATE", "DELETE"])
        {
            Assert.DoesNotContain(verb, sql!, StringComparison.Ordinal);
        }
    }
}
