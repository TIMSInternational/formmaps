using System.Text.Json;
using FormMaps.Application.StudentPortfolio;

namespace FormMaps.UnitTests.StudentPortfolio;

/// <summary>
/// Pins the zod createPortfolioSchema / updatePortfolioSchema(.partial()) port (routes/student.ts): required title
/// (create only) with min 1 / max 150, optional string maxes, the enum, int bounds on weeksPerYear, array-of-string,
/// and — the load-bearing parity — the FIRST failing field's message in schema-declaration order (== errors[0].message).
/// </summary>
public sealed class StudentPortfolioValidationTests
{
    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public void Create_requires_title()
    {
        var result = StudentPortfolioValidation.ValidateCreate(Body("{}"));
        Assert.False(result.Ok);
        Assert.Equal("Required", result.Message);
    }

    [Fact]
    public void Update_title_is_optional()
    {
        var result = StudentPortfolioValidation.ValidateUpdate(Body("{}"));
        Assert.True(result.Ok);
    }

    [Fact]
    public void Create_accepts_minimal_valid_body()
    {
        var result = StudentPortfolioValidation.ValidateCreate(Body("""{"title":"Robotics"}"""));
        Assert.True(result.Ok);
        Assert.True(result.Input!.HasTitle);
        Assert.Equal("Robotics", result.Input.Title);
    }

    [Theory]
    [InlineData("""{"title":""}""", "String must contain at least 1 character(s)")]
    [InlineData("""{"title":5}""", "Expected string, received number")]
    public void Create_title_min_and_type(string json, string message)
    {
        var result = StudentPortfolioValidation.ValidateCreate(Body(json));
        Assert.False(result.Ok);
        Assert.Equal(message, result.Message);
    }

    [Fact]
    public void Title_max_150()
    {
        var big = new string('x', 151);
        var result = StudentPortfolioValidation.ValidateCreate(Body($$"""{"title":"{{big}}"}"""));
        Assert.False(result.Ok);
        Assert.Equal("String must contain at most 150 character(s)", result.Message);
    }

    [Fact]
    public void Organization_max_100()
    {
        var big = new string('x', 101);
        var result = StudentPortfolioValidation.ValidateCreate(Body($$"""{"title":"t","organization":"{{big}}"}"""));
        Assert.False(result.Ok);
        Assert.Equal("String must contain at most 100 character(s)", result.Message);
    }

    [Fact]
    public void First_error_wins_in_declaration_order()
    {
        // type (field 1) is a bad type AND organization (field 3) is too long → type's error wins.
        var result = StudentPortfolioValidation.ValidateCreate(
            Body("""{"type":5,"title":"t","organization":"x"}"""));
        Assert.False(result.Ok);
        Assert.Equal("Expected string, received number", result.Message);
    }

    [Theory]
    [InlineData("""{"title":"t","activityCategory":"nope"}""")]
    [InlineData("""{"title":"t","activityCategory":5}""")]
    public void Activity_category_enum(string json)
    {
        var result = StudentPortfolioValidation.ValidateCreate(Body(json));
        Assert.False(result.Ok);
        Assert.StartsWith("Invalid enum value. Expected 'academic' | 'athletic' | 'arts' | 'community_service' | 'work' | 'leadership' | 'other', received", result.Message);
    }

    [Fact]
    public void Activity_category_accepts_valid_enum()
    {
        var result = StudentPortfolioValidation.ValidateCreate(Body("""{"title":"t","activityCategory":"community_service"}"""));
        Assert.True(result.Ok);
        Assert.Equal("community_service", result.Input!.ActivityCategory);
    }

    [Theory]
    [InlineData("""{"title":"t","weeksPerYear":5.5}""", "Expected integer, received float")]
    [InlineData("""{"title":"t","weeksPerYear":-1}""", "Number must be greater than or equal to 0")]
    [InlineData("""{"title":"t","weeksPerYear":53}""", "Number must be less than or equal to 52")]
    [InlineData("""{"title":"t","weeksPerYear":"x"}""", "Expected number, received string")]
    public void WeeksPerYear_int_bounds(string json, string message)
    {
        var result = StudentPortfolioValidation.ValidateCreate(Body(json));
        Assert.False(result.Ok);
        Assert.Equal(message, result.Message);
    }

    [Fact]
    public void Numbers_parsed_to_decimal()
    {
        var result = StudentPortfolioValidation.ValidateCreate(Body("""{"title":"t","hoursPerWeek":5.5,"totalHours":40}"""));
        Assert.True(result.Ok);
        Assert.Equal(5.5m, result.Input!.HoursPerWeek);
        Assert.Equal(40m, result.Input.TotalHours);
    }

    [Theory]
    [InlineData("""{"title":"t","achievements":"nope"}""", "Expected array, received string")]
    [InlineData("""{"title":"t","achievements":[5]}""", "Expected string, received number")]
    public void Achievements_array_of_string(string json, string message)
    {
        var result = StudentPortfolioValidation.ValidateCreate(Body(json));
        Assert.False(result.Ok);
        Assert.Equal(message, result.Message);
    }

    [Fact]
    public void Achievements_accepts_string_array()
    {
        var result = StudentPortfolioValidation.ValidateCreate(Body("""{"title":"t","achievements":["a","b"],"skills":[]}"""));
        Assert.True(result.Ok);
        Assert.Equal(["a", "b"], result.Input!.Achievements!);
        Assert.True(result.Input.HasSkills);
        Assert.Empty(result.Input.Skills!);
    }

    [Theory]
    [InlineData("5", "Expected object, received number")]
    [InlineData("[]", "Expected object, received array")]
    [InlineData("\"x\"", "Expected object, received string")]
    public void Non_object_body_rejected(string json, string message)
    {
        var result = StudentPortfolioValidation.ValidateCreate(Body(json));
        Assert.False(result.Ok);
        Assert.Equal(message, result.Message);
    }

    [Fact]
    public void IsCurrent_bool_type()
    {
        var result = StudentPortfolioValidation.ValidateCreate(Body("""{"title":"t","isCurrent":"yes"}"""));
        Assert.False(result.Ok);
        Assert.Equal("Expected boolean, received string", result.Message);
    }
}
