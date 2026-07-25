using System.Text.Json;
using FormMaps.Application.Resumes;

namespace FormMaps.UnitTests.Resumes;

/// <summary>
/// Pure POST /api/resume field-coalescing (FM-DOTNET-090) — parity with routes/resume.ts L109-120's per-field
/// JS-<c>||</c> defaults. Pins the String columns (name/template/careerField: truthy string used, falsy → default,
/// truthy non-string → null = a 500 signal) and the jsonb columns (any truthy JSON stored verbatim — incl. empty
/// array/object and scalar strings/numbers — falsy → the {} / [] default).
/// </summary>
public sealed class ResumeCreateTests
{
    private static ResumeCreateValues? Resolve(string json) =>
        ResumeCreate.Resolve(JsonDocument.Parse(json).RootElement.Clone());

    [Fact]
    public void Empty_body_yields_all_defaults()
    {
        var v = Resolve("{}")!;
        Assert.Equal("My Resume", v.Name);
        Assert.Equal("default", v.Template);
        Assert.Equal("", v.CareerField);
        Assert.Equal("{}", v.PersonalInfoJson);
        Assert.Equal("[]", v.ExperienceJson);
        Assert.Equal("[]", v.EducationJson);
        Assert.Equal("[]", v.SkillsJson);
        Assert.Equal("[]", v.SectionsJson);
        Assert.Equal("{}", v.FieldVisibilityJson);
        Assert.Equal("[]", v.CustomFieldsJson);
    }

    [Fact]
    public void Truthy_strings_are_used()
    {
        var v = Resolve("""{"name":"Résumé","template":"modern","careerField":"eng"}""")!;
        Assert.Equal("Résumé", v.Name);
        Assert.Equal("modern", v.Template);
        Assert.Equal("eng", v.CareerField);
    }

    [Theory]
    [InlineData("\"\"")]   // empty string → falsy
    [InlineData("null")]   // null → falsy
    [InlineData("false")]  // false → falsy
    [InlineData("0")]      // 0 → falsy
    public void Falsy_string_field_falls_back(string value)
    {
        var v = Resolve($$"""{"name":{{value}}}""")!;
        Assert.Equal("My Resume", v.Name);
    }

    [Theory]
    [InlineData("5")]              // truthy number
    [InlineData("true")]           // boolean true
    [InlineData("{\"a\":1}")]     // object
    [InlineData("[1,2]")]          // array
    [InlineData("[]")]             // empty array is JS-truthy → still a non-string
    public void Truthy_non_string_field_is_rejected(string value)
    {
        Assert.Null(Resolve($$"""{"template":{{value}}}"""));
    }

    [Fact]
    public void Any_string_field_rejects_independently()
    {
        Assert.Null(Resolve("""{"name":"ok","careerField":7}"""));
    }

    [Fact]
    public void Truthy_jsonb_is_stored_verbatim()
    {
        var v = Resolve("""{"personalInfo":{"name":"A"},"experience":[{"c":"X"}],"skills":["a","b"]}""")!;
        Assert.Equal("""{"name":"A"}""", v.PersonalInfoJson);
        Assert.Equal("""[{"c":"X"}]""", v.ExperienceJson);
        Assert.Equal("""["a","b"]""", v.SkillsJson);
    }

    [Fact]
    public void Empty_array_or_object_jsonb_is_truthy_and_stored()
    {
        // [] and {} are JS-truthy, so they WIN over the default (personalInfo:[] stores [], not {}).
        var v = Resolve("""{"personalInfo":[],"fieldVisibility":[]}""")!;
        Assert.Equal("[]", v.PersonalInfoJson);
        Assert.Equal("[]", v.FieldVisibilityJson);
    }

    [Theory]
    [InlineData("null")]
    [InlineData("false")]
    [InlineData("0")]
    [InlineData("\"\"")]
    public void Falsy_jsonb_falls_back_to_default(string value)
    {
        var v = Resolve($$"""{"personalInfo":{{value}},"experience":{{value}}}""")!;
        Assert.Equal("{}", v.PersonalInfoJson);
        Assert.Equal("[]", v.ExperienceJson);
    }

    [Fact]
    public void Truthy_scalar_jsonb_is_stored_as_json_scalar()
    {
        // jsonb accepts any JSON — a truthy string/number is stored as a JSON scalar, no 500 (unlike a String column).
        var v = Resolve("""{"skills":"hi","customFields":3}""")!;
        Assert.Equal("\"hi\"", v.SkillsJson);
        Assert.Equal("3", v.CustomFieldsJson);
    }

    [Fact]
    public void Array_body_reads_as_no_properties_so_all_defaults()
    {
        // req.body being a JSON array → req.body.name etc. are undefined → every field defaults.
        var v = Resolve("""[1,2,3]""")!;
        Assert.Equal("My Resume", v.Name);
        Assert.Equal("{}", v.PersonalInfoJson);
        Assert.Equal("[]", v.SkillsJson);
    }
}
