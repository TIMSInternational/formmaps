using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Unit pins for the question360 write validation (port of zod questionSchema / updateQuestionSchema in
/// routes/question360.ts). Covers first-error order, the string min/max + questionNumber int/positive bounds,
/// the create defaults (isSubQuestion=false, parentQuestionId=null materialized), and the deliberate isActive
/// exclusion from the update schema (mass-assignment guard).
/// </summary>
public sealed class Question360ValidationTests
{
    private const string ValidCreate =
        """{"questionEnglishText":"Q?","questionSpanishText":"¿Q?","category":"collab","relationType":"peer","questionNumber":3}""";

    private static JsonElement Json(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static object? Col(Question360ValidationResult r, string name) =>
        r.Fields!.Columns.FirstOrDefault(c => c.Name == name)?.Value;

    [Fact]
    public void Create_materializes_defaults_and_omits_audit_columns()
    {
        var r = Question360Validation.ValidateCreate(Json(ValidCreate));

        Assert.True(r.Ok);
        Assert.Equal("Q?", Col(r, "questionEnglishText"));
        Assert.Equal("¿Q?", Col(r, "questionSpanishText"));
        Assert.Equal(3L, Col(r, "questionNumber")); // carried as long (int8) so an out-of-int4 value reaches the DB
        Assert.Equal(false, Col(r, "isSubQuestion"));         // zod default
        Assert.Equal(DBNull.Value, Col(r, "parentQuestionId")); // zod default null
        Assert.DoesNotContain(r.Fields!.Columns, c => c.Name is "createdBy" or "updatedBy" or "isActive");
    }

    [Fact]
    public void Create_honors_supplied_isSubQuestion_and_parentQuestionId()
    {
        var r = Question360Validation.ValidateCreate(Json(
            """{"questionEnglishText":"e","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":1,"isSubQuestion":true,"parentQuestionId":"p-1"}"""));

        Assert.True(r.Ok);
        Assert.Equal(true, Col(r, "isSubQuestion"));
        Assert.Equal("p-1", Col(r, "parentQuestionId"));
    }

    [Theory]
    [InlineData("[]", "Expected object, received array")]
    [InlineData("42", "Expected object, received number")]
    [InlineData("null", "Expected object, received null")]
    public void Create_rejects_a_non_object_body(string body, string message)
    {
        var r = Question360Validation.ValidateCreate(Json(body));
        Assert.False(r.Ok);
        Assert.Equal(message, r.Message);
    }

    [Fact]
    public void Create_missing_required_field_is_Required_in_schema_order()
    {
        // questionSpanishText missing → the FIRST failure is questionSpanishText (english passed).
        var r = Question360Validation.ValidateCreate(Json(
            """{"questionEnglishText":"e","category":"c","relationType":"r","questionNumber":1}"""));
        Assert.False(r.Ok);
        Assert.Equal("Required", r.Message);
    }

    [Theory]
    [InlineData("""{"questionEnglishText":"","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":1}""", "String must contain at least 1 character(s)")]
    [InlineData("""{"questionEnglishText":1,"questionSpanishText":"s","category":"c","relationType":"r","questionNumber":1}""", "Expected string, received number")]
    [InlineData("""{"questionEnglishText":"e","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":1.5}""", "Expected integer, received float")]
    [InlineData("""{"questionEnglishText":"e","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":0}""", "Number must be greater than 0")]
    [InlineData("""{"questionEnglishText":"e","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":"x"}""", "Expected number, received string")]
    public void Create_field_validation_messages(string body, string message)
    {
        var r = Question360Validation.ValidateCreate(Json(body));
        Assert.False(r.Ok);
        Assert.Equal(message, r.Message);
    }

    [Fact]
    public void Create_category_max_is_100_characters()
    {
        var big = new string('x', 101);
        var r = Question360Validation.ValidateCreate(Json(
            $$"""{"questionEnglishText":"e","questionSpanishText":"s","category":"{{big}}","relationType":"r","questionNumber":1}"""));
        Assert.False(r.Ok);
        Assert.Equal("String must contain at most 100 character(s)", r.Message);
    }

    [Fact]
    public void Update_is_all_optional_empty_body_ok_no_columns()
    {
        var r = Question360Validation.ValidateUpdate(Json("{}"));
        Assert.True(r.Ok);
        Assert.Empty(r.Fields!.Columns);
    }

    [Fact]
    public void Update_ignores_isActive_mass_assignment()
    {
        // isActive is deliberately excluded from updateQuestionSchema — the validator never binds it.
        var r = Question360Validation.ValidateUpdate(Json("""{"category":"c2","isActive":false}"""));
        Assert.True(r.Ok);
        Assert.Equal("c2", Col(r, "category"));
        Assert.DoesNotContain(r.Fields!.Columns, c => c.Name == "isActive");
    }

    [Fact]
    public void QuestionNumber_beyond_int32_still_validates_and_is_carried_as_long()
    {
        // zod int().positive() has no upper bound → a >Int32 value passes validation; it must be carried as a long
        // (NOT wrapped by an int cast) so the INSERT into the int4 column is what rejects it (22003).
        var r = Question360Validation.ValidateCreate(Json(
            """{"questionEnglishText":"e","questionSpanishText":"s","category":"c","relationType":"r","questionNumber":9999999999}"""));
        Assert.True(r.Ok);
        Assert.Equal(9999999999L, Col(r, "questionNumber"));
    }

    [Fact]
    public void Update_validates_present_fields()
    {
        var r = Question360Validation.ValidateUpdate(Json("""{"questionNumber":-1}"""));
        Assert.False(r.Ok);
        Assert.Equal("Number must be greater than 0", r.Message);
    }

    [Fact]
    public void ParentQuestionId_null_is_allowed_but_a_number_is_rejected()
    {
        Assert.True(Question360Validation.ValidateUpdate(Json("""{"parentQuestionId":null}""")).Ok);

        var bad = Question360Validation.ValidateUpdate(Json("""{"parentQuestionId":5}"""));
        Assert.False(bad.Ok);
        Assert.Equal("Expected string, received number", bad.Message);
    }
}
