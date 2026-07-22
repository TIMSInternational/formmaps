using System.Text.Json;
using FormMaps.Application.CurriculumFrameworks;

namespace FormMaps.UnitTests.CurriculumFrameworks;

/// <summary>
/// Pure parity for FrameworkOverrideBuilder (FM-DOTNET-055) — the customize-course body parse that carries the
/// create-vs-update UNDEFINED ASYMMETRY. RED-IF-REGRESSED: pins that credits/localName are marked PRESENT only when
/// the body actually has the key (a present JSON null counts as present-with-null; an ABSENT key is NOT present, so
/// the writer keeps the existing column on update), and that gradeLevels is the JS `gradeLevel || gradeLevels || []`
/// resolution (an array — even empty — is truthy, so a present gradeLevel array wins; null/absent falls through).
/// </summary>
public class FrameworkOverrideBuilderTests
{
    private static FrameworkOverrideInput Build(string json) =>
        FrameworkOverrideBuilder.Build(JsonDocument.Parse(json).RootElement);

    [Fact]
    public void Absent_credits_and_localName_are_not_present()
    {
        var input = Build("""{"gradeLevel":[9,10]}""");

        Assert.False(input.HasCredits); // absent → NOT written on update (keeps existing); NULL on create
        Assert.Null(input.Credits);
        Assert.False(input.HasLocalName);
        Assert.Null(input.LocalName);
        Assert.Equal([9, 10], input.GradeLevels);
    }

    [Fact]
    public void Present_credits_and_localName_are_captured()
    {
        var input = Build("""{"credits":3.5,"localName":"Calc I","gradeLevels":[11]}""");

        Assert.True(input.HasCredits);
        Assert.Equal(3.5m, input.Credits);
        Assert.True(input.HasLocalName);
        Assert.Equal("Calc I", input.LocalName);
        Assert.Equal([11], input.GradeLevels);
    }

    [Fact]
    public void Present_null_credits_is_present_with_null()
    {
        var input = Build("""{"credits":null,"localName":null}""");

        // A present JSON null is PRESENT — on create → NULL, on update → SET NULL (legacy `data.x = null`).
        Assert.True(input.HasCredits);
        Assert.Null(input.Credits);
        Assert.True(input.HasLocalName);
        Assert.Null(input.LocalName);
    }

    [Fact]
    public void Numeric_string_credits_is_parsed_present_nonnumeric_stays_absent()
    {
        // Prisma Decimal coerces a numeric string ("0.5"→0.5); legacy writes/returns it (FM-055 gate fold, Codex HIGH).
        var ok = Build("""{"credits":"0.5"}""");
        Assert.True(ok.HasCredits);
        Assert.Equal(0.5m, ok.Credits);

        // A NON-numeric string stays ABSENT (non-destructive; legacy would 500 at Prisma, but the writer's 404/
        // wrong-type checks run BEFORE the upsert, so we deliberately do NOT throw up front).
        var bad = Build("""{"credits":"abc"}""");
        Assert.False(bad.HasCredits);
        Assert.Null(bad.Credits);
    }

    [Fact]
    public void GradeLevel_singular_wins_over_plural_even_when_empty()
    {
        // JS `req.body.gradeLevel || req.body.gradeLevels || []` — an EMPTY array is truthy, so gradeLevel:[] wins.
        var input = Build("""{"gradeLevel":[],"gradeLevels":[12]}""");

        Assert.Empty(input.GradeLevels);
    }

    [Fact]
    public void GradeLevel_null_falls_through_to_plural()
    {
        var input = Build("""{"gradeLevel":null,"gradeLevels":[9,12]}""");

        Assert.Equal([9, 12], input.GradeLevels);
    }

    [Fact]
    public void Neither_gradeLevel_key_defaults_to_empty_array()
    {
        var input = Build("""{"credits":1}""");

        Assert.Empty(input.GradeLevels);
    }

    [Fact]
    public void Empty_body_is_all_absent()
    {
        var input = Build("{}");

        Assert.False(input.HasCredits);
        Assert.False(input.HasLocalName);
        Assert.Empty(input.GradeLevels);
    }
}
