using FormMaps.Application.Graduation;

namespace FormMaps.UnitTests.Graduation;

/// <summary>
/// Parity for the three <c>lib/rigorTemplates.ts</c> functions the graduation-plan routes call. These decide
/// the <c>fieldKey</c> / <c>selectivityTier</c> / <c>templateKey</c> a PUT /graduation-plan/target PERSISTS,
/// so a drift here is not a display bug — it is a different row in student_graduation_targets and, later, a
/// different plan out of the Node planner that still owns POST /generate.
/// </summary>
public class RigorTemplatesTests
{
    // ---------------------------------------------------------------- normalizeField

    [Fact]
    public void Exact_field_key_wins_before_any_alias()
    {
        Assert.Equal("computer-science", RigorTemplates.NormalizeField("computer-science", null));
        Assert.Equal("undecided-general", RigorTemplates.NormalizeField("Undecided-General", null));
    }

    [Fact]
    public void Exact_alias_resolves_case_insensitively_and_after_trimming()
    {
        Assert.Equal("computer-science", RigorTemplates.NormalizeField("  Computer Science  ", null));
        Assert.Equal("biology-premed", RigorTemplates.NormalizeField("PRE-MED", null));
        Assert.Equal("humanities", RigorTemplates.NormalizeField("Pre-Law", null));
    }

    /// <summary>
    /// The longest-alias-first substring pass (rigorTemplates.ts:95). "computer engineering" contains BOTH
    /// "computer engineering" (-> computer-science) and "engineering" (-> engineering); the length sort is the
    /// only thing that picks the right one, and reversing it would silently re-file every CE student.
    /// </summary>
    [Fact]
    public void Substring_pass_prefers_the_longest_alias()
    {
        Assert.Equal("computer-science", RigorTemplates.NormalizeField("BS in Computer Engineering", null));
        Assert.Equal("engineering", RigorTemplates.NormalizeField("Some Engineering Degree", null));
    }

    [Fact]
    public void Preferred_fields_are_probed_in_order_only_after_the_major_fails()
    {
        // The major resolves, so the preference is never consulted.
        Assert.Equal("mathematics", RigorTemplates.NormalizeField("Statistics", ["nursing"]));

        // The major resolves nothing; the FIRST preference that resolves wins.
        Assert.Equal("arts", RigorTemplates.NormalizeField("zzzz", ["qqqq", "Graphic Design", "Physics"]));
    }

    [Fact]
    public void Unresolvable_input_falls_back_to_undecided_general()
    {
        Assert.Equal("undecided-general", RigorTemplates.NormalizeField("zzzz", null));
        Assert.Equal("undecided-general", RigorTemplates.NormalizeField(string.Empty, []));
    }

    // ---------------------------------------------------------------- resolveTier

    /// <summary>
    /// The null handling is asymmetric and load-bearing: NO university at all is "open", but a university
    /// whose acceptanceRate is unknown is "selective". setTarget picks between them purely on whether a
    /// universityId or a universityName survived normalization.
    /// </summary>
    [Fact]
    public void Missing_rate_is_selective_with_a_university_and_open_without_one()
    {
        Assert.Equal("selective", RigorTemplates.ResolveTier(hasUniversity: true, acceptanceRate: null));
        Assert.Equal("open", RigorTemplates.ResolveTier(hasUniversity: false, acceptanceRate: null));
        Assert.Equal("selective", RigorTemplates.ResolveTier(hasUniversity: true, acceptanceRate: double.NaN));
    }

    [Theory]
    [InlineData(0.04, "most-selective")]
    [InlineData(0.15, "most-selective")] // <= the band, inclusive
    [InlineData(0.1500001, "selective")]
    [InlineData(0.4, "selective")] // <= the band, inclusive
    [InlineData(0.41, "open")]
    [InlineData(0.9, "open")]
    public void Bands_are_inclusive_upper_bounds(double rate, string expected) =>
        Assert.Equal(expected, RigorTemplates.ResolveTier(hasUniversity: true, acceptanceRate: rate));

    // ---------------------------------------------------------------- resolveTemplate label

    [Theory]
    [InlineData("computer-science", "most-selective", "Computer Science — Most Selective")]
    [InlineData("computer-science", "selective", "Computer Science — Selective")]
    [InlineData("arts", "open", "Arts & Design — Open Admissions")]
    [InlineData("biology-premed", "selective", "Biology / Pre-Med — Selective")]
    public void Label_is_the_field_label_an_em_dash_and_the_tier_word(string field, string tier, string expected) =>
        Assert.Equal(expected, RigorTemplates.ResolveTemplateLabel(field, tier));

    /// <summary>An unknown FIELD is not an error — it silently becomes undecided-general (rigorTemplates.ts:121).</summary>
    [Fact]
    public void Unknown_field_falls_back_to_undecided_general_label() =>
        Assert.Equal(
            "Undecided / General Admissions — Selective",
            RigorTemplates.ResolveTemplateLabel("not-a-field", "selective"));

    /// <summary>
    /// An unknown TIER, by contrast, IS an error: legacy dereferences <c>field.tiers[tier]</c> and throws a
    /// TypeError, which the route turns into a 500. Pinned so a later "just default to selective" tidy-up is a
    /// deliberate behaviour change rather than an accident on flip.
    /// </summary>
    [Fact]
    public void Unknown_tier_throws_the_way_legacy_does()
    {
        Assert.Throws<InvalidOperationException>(() => RigorTemplates.ResolveTemplateLabel("arts", "bogus"));
        Assert.Throws<InvalidOperationException>(() => RigorTemplates.ResolveTemplateLabel("arts", null));
    }

    [Fact]
    public void The_vendored_file_still_carries_all_ten_fields() =>
        Assert.Equal(10, RigorTemplates.FieldKeys.Count);
}
