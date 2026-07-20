using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins the zod create/update(.partial()) schema port (routes/test-scores.ts): required testType, inclusive
/// integer bounds with .int() (a float is rejected), apSubject max 120, record/boolean type checks, and — the
/// load-bearing parity — the FIRST failing field's message in schema-declaration order (== errors[0].message).
/// </summary>
public sealed class TestScoreValidationTests
{
    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public void Create_requires_testType()
    {
        var result = TestScoreValidation.ValidateCreate(Body("{}"));
        Assert.False(result.Ok);
        Assert.Equal("Required", result.Message);
    }

    [Fact]
    public void Create_accepts_minimal_valid_body()
    {
        var result = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT"}"""));
        Assert.True(result.Ok);
        Assert.Equal("SAT", result.Fields!.Columns["testType"].Value);
    }

    [Theory]
    [InlineData("\"NOPE\"")]
    [InlineData("5")]
    public void Create_rejects_bad_testType_enum(string raw)
    {
        var result = TestScoreValidation.ValidateCreate(Body($$"""{"testType":{{raw}}}"""));
        Assert.False(result.Ok);
        Assert.StartsWith("Invalid enum value. Expected 'SAT' | 'ACT' | 'AP' | 'PSAT' | 'TOEFL' | 'IB', received", result.Message);
    }

    [Theory]
    [InlineData(400)]
    [InlineData(1600)]
    public void SatTotal_boundaries_are_inclusive(int value)
    {
        var result = TestScoreValidation.ValidateCreate(Body($$"""{"testType":"SAT","satTotal":{{value}}}"""));
        Assert.True(result.Ok);
        Assert.Equal(value, result.Fields!.Columns["satTotal"].Value);
    }

    [Fact]
    public void SatTotal_below_min_is_rejected_with_zod_message()
    {
        var result = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT","satTotal":399}"""));
        Assert.False(result.Ok);
        Assert.Equal("Number must be greater than or equal to 400", result.Message);
    }

    [Fact]
    public void SatTotal_above_max_is_rejected_with_zod_message()
    {
        var result = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT","satTotal":1601}"""));
        Assert.False(result.Ok);
        Assert.Equal("Number must be less than or equal to 1600", result.Message);
    }

    [Fact]
    public void A_float_score_is_rejected_as_non_integer()
    {
        var result = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT","satTotal":1450.5}"""));
        Assert.False(result.Ok);
        Assert.Equal("Expected integer, received float", result.Message);
    }

    [Fact]
    public void An_integral_double_passes_the_int_check()
    {
        // JS has no int/float split: 1450.0 === 1450, so .int() passes (System.Text.Json would fail TryGetInt64).
        var result = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT","satTotal":1450.0}"""));
        Assert.True(result.Ok);
        Assert.Equal(1450, result.Fields!.Columns["satTotal"].Value);
    }

    [Fact]
    public void A_string_score_is_rejected_as_non_number()
    {
        var result = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT","satMath":"700"}"""));
        Assert.False(result.Ok);
        Assert.Equal("Expected number, received string", result.Message);
    }

    [Fact]
    public void ApSubject_over_120_chars_is_rejected()
    {
        var subject = new string('x', 121);
        var result = TestScoreValidation.ValidateCreate(Body($$"""{"testType":"AP","apSubject":"{{subject}}"}"""));
        Assert.False(result.Ok);
        Assert.Equal("String must contain at most 120 character(s)", result.Message);
    }

    [Fact]
    public void ApSubject_at_120_chars_is_accepted()
    {
        var subject = new string('x', 120);
        var result = TestScoreValidation.ValidateCreate(Body($$"""{"testType":"AP","apSubject":"{{subject}}"}"""));
        Assert.True(result.Ok);
    }

    [Theory]
    [InlineData("apScore", 6, "Number must be less than or equal to 5")]
    [InlineData("apScore", 0, "Number must be greater than or equal to 1")]
    [InlineData("totalScore", -1, "Number must be greater than or equal to 0")]
    [InlineData("totalScore", 10001, "Number must be less than or equal to 10000")]
    public void Bounds_are_enforced(string field, int value, string expected)
    {
        var result = TestScoreValidation.ValidateCreate(Body($$"""{"testType":"AP","{{field}}":{{value}}}"""));
        Assert.False(result.Ok);
        Assert.Equal(expected, result.Message);
    }

    [Fact]
    public void SubScores_must_be_an_object_not_an_array()
    {
        var result = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT","subScores":[1,2]}"""));
        Assert.False(result.Ok);
        Assert.Equal("Expected object, received array", result.Message);
    }

    [Fact]
    public void SubScores_object_passes_through_as_jsonb()
    {
        var result = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT","subScores":{"essay":7}}"""));
        Assert.True(result.Ok);
        var col = result.Fields!.Columns["subScores"];
        Assert.True(col.IsJsonb);
    }

    [Fact]
    public void A_non_boolean_flag_is_rejected()
    {
        var result = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT","isOfficial":"yes"}"""));
        Assert.False(result.Ok);
        Assert.Equal("Expected boolean, received string", result.Message);
    }

    [Fact]
    public void First_error_follows_schema_order_testType_before_satTotal()
    {
        var result = TestScoreValidation.ValidateCreate(Body("""{"testType":"NOPE","satTotal":10}"""));
        Assert.False(result.Ok);
        Assert.StartsWith("Invalid enum value", result.Message); // testType is checked first
    }

    [Fact]
    public void First_error_follows_schema_order_satMath_before_actMath()
    {
        var result = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT","satMath":10,"actMath":99}"""));
        Assert.False(result.Ok);
        Assert.Equal("Number must be greater than or equal to 200", result.Message); // satMath before actMath
    }

    [Fact]
    public void Update_allows_an_empty_body()
    {
        var result = TestScoreValidation.ValidateUpdate(Body("{}"));
        Assert.True(result.Ok);
        Assert.Empty(result.Fields!.Columns);
    }

    [Fact]
    public void Update_validates_present_fields_only()
    {
        var ok = TestScoreValidation.ValidateUpdate(Body("""{"satMath":250}"""));
        Assert.True(ok.Ok);
        Assert.Equal(250, ok.Fields!.Columns["satMath"].Value);

        var bad = TestScoreValidation.ValidateUpdate(Body("""{"satMath":50}"""));
        Assert.False(bad.Ok);
    }

    [Theory]
    [InlineData("[]", "Expected object, received array")]
    [InlineData("null", "Expected object, received null")]
    [InlineData("5", "Expected object, received number")]
    [InlineData("\"hi\"", "Expected object, received string")]
    [InlineData("true", "Expected object, received boolean")]
    public void Create_rejects_a_non_object_body(string json, string expected)
    {
        var result = TestScoreValidation.ValidateCreate(Body(json));
        Assert.False(result.Ok);
        Assert.Equal(expected, result.Message);
    }

    [Theory]
    [InlineData("[]", "Expected object, received array")]
    [InlineData("null", "Expected object, received null")]
    [InlineData("42", "Expected object, received number")]
    [InlineData("true", "Expected object, received boolean")]
    public void Update_rejects_a_non_object_body(string json, string expected)
    {
        var result = TestScoreValidation.ValidateUpdate(Body(json));
        Assert.False(result.Ok);
        Assert.Equal(expected, result.Message);
    }

    [Fact]
    public void Empty_testDate_string_is_carried_as_present_for_the_writer_to_null()
    {
        var result = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT","testDate":""}"""));
        Assert.True(result.Ok);
        Assert.True(result.Fields!.TestDatePresent);
        Assert.Equal(string.Empty, result.Fields.TestDateRaw);
    }

    [Fact]
    public void TestDate_must_be_a_string_when_present()
    {
        var bad = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT","testDate":123}"""));
        Assert.False(bad.Ok);
        Assert.Equal("Expected string, received number", bad.Message);

        var ok = TestScoreValidation.ValidateCreate(Body("""{"testType":"SAT","testDate":"2025-03-01"}"""));
        Assert.True(ok.Ok);
        Assert.True(ok.Fields!.TestDatePresent);
        Assert.Equal("2025-03-01", ok.Fields.TestDateRaw);
    }
}
