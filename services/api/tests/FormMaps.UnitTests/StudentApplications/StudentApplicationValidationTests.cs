using System.Text.Json;
using FormMaps.Application.StudentApplications;

namespace FormMaps.UnitTests.StudentApplications;

/// <summary>
/// Pins the zod createApplicationSchema port (routes/student.ts POST /applications): required name (min1/max100),
/// the .default() on type ("university") and column ("researching"), matchScore z.number() range 0-100 (float allowed),
/// the column enum, and the FIRST failing field's message in schema-declaration order (== errors[0].message).
/// </summary>
public sealed class StudentApplicationValidationTests
{
    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public void Requires_name()
    {
        var r = StudentApplicationValidation.ValidateCreate(Body("{}"));
        Assert.False(r.Ok);
        Assert.Equal("Required", r.Message);
    }

    [Fact]
    public void Applies_type_and_column_defaults()
    {
        var r = StudentApplicationValidation.ValidateCreate(Body("""{"name":"MIT"}"""));
        Assert.True(r.Ok);
        Assert.Equal("MIT", r.Parsed!.Name);
        Assert.Equal("university", r.Parsed.Type);       // .default("university")
        Assert.Equal("researching", r.Parsed.Column);    // .default("researching")
    }

    [Theory]
    [InlineData("""{"name":""}""", "String must contain at least 1 character(s)")]
    [InlineData("""{"name":5}""", "Expected string, received number")]
    public void Name_min_and_type(string json, string message)
    {
        var r = StudentApplicationValidation.ValidateCreate(Body(json));
        Assert.False(r.Ok);
        Assert.Equal(message, r.Message);
    }

    [Fact]
    public void Name_max_100()
    {
        var big = new string('x', 101);
        var r = StudentApplicationValidation.ValidateCreate(Body($$"""{"name":"{{big}}"}"""));
        Assert.False(r.Ok);
        Assert.Equal("String must contain at most 100 character(s)", r.Message);
    }

    [Fact]
    public void Type_max_50()
    {
        var big = new string('x', 51);
        var r = StudentApplicationValidation.ValidateCreate(Body($$"""{"name":"n","type":"{{big}}"}"""));
        Assert.False(r.Ok);
        Assert.Equal("String must contain at most 50 character(s)", r.Message);
    }

    [Theory]
    [InlineData("""{"name":"n","matchScore":-1}""", "Number must be greater than or equal to 0")]
    [InlineData("""{"name":"n","matchScore":101}""", "Number must be less than or equal to 100")]
    [InlineData("""{"name":"n","matchScore":"x"}""", "Expected number, received string")]
    public void MatchScore_range(string json, string message)
    {
        var r = StudentApplicationValidation.ValidateCreate(Body(json));
        Assert.False(r.Ok);
        Assert.Equal(message, r.Message);
    }

    [Fact]
    public void MatchScore_allows_in_range_float_at_validation()
    {
        // zod z.number() has no .int() — 85.5 passes validation (the endpoint 500s it at the Int column).
        var r = StudentApplicationValidation.ValidateCreate(Body("""{"name":"n","matchScore":85.5}"""));
        Assert.True(r.Ok);
        Assert.Equal(85.5m, r.Parsed!.MatchScore);
    }

    [Fact]
    public void Column_invalid_string_is_invalid_enum_value()
    {
        var r = StudentApplicationValidation.ValidateCreate(Body("""{"name":"n","column":"nope"}"""));
        Assert.False(r.Ok);
        Assert.Equal("Invalid enum value. Expected 'researching' | 'shortlisted' | 'applying' | 'applied' | 'accepted', received 'nope'", r.Message);
    }

    [Theory]
    [InlineData("""{"name":"n","column":5}""", "number")]
    [InlineData("""{"name":"n","column":null}""", "null")]
    [InlineData("""{"name":"n","column":true}""", "boolean")]
    public void Column_non_string_is_invalid_type(string json, string received)
    {
        // zod ZodEnum type-checks first → invalid_type, NOT invalid_enum_value.
        var r = StudentApplicationValidation.ValidateCreate(Body(json));
        Assert.False(r.Ok);
        Assert.Equal($"Expected 'researching' | 'shortlisted' | 'applying' | 'applied' | 'accepted', received {received}", r.Message);
    }

    [Fact]
    public void First_error_wins_in_declaration_order()
    {
        // name (field 1) bad AND matchScore (field 4) out of range → name's error wins.
        var r = StudentApplicationValidation.ValidateCreate(Body("""{"name":5,"matchScore":999}"""));
        Assert.False(r.Ok);
        Assert.Equal("Expected string, received number", r.Message);
    }

    [Theory]
    [InlineData("5", "Expected object, received number")]
    [InlineData("[]", "Expected object, received array")]
    public void Non_object_rejected(string json, string message)
    {
        var r = StudentApplicationValidation.ValidateCreate(Body(json));
        Assert.False(r.Ok);
        Assert.Equal(message, r.Message);
    }
}
