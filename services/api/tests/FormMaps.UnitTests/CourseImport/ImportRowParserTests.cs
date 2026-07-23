using System.Text.Json;
using FormMaps.Application.CourseImport;

namespace FormMaps.UnitTests.CourseImport;

/// <summary>
/// Pure parity for <see cref="ImportRowParser.Parse"/> (FM-DOTNET-059 gate folds). RED-IF-REGRESSED: the JS-truthiness
/// credits coercion (string verbatim / truthy number → text / 0 / "" / null → skip), and the RowTypeInvalid detection
/// that fails a row whose scalar carries a JSON type Prisma would reject (non-string department/description,
/// non-int gradeLevels element, non-string/number credits) rather than silently succeeding as the string-only parse did.
/// </summary>
public class ImportRowParserTests
{
    private static ImportRow Parse(string json) => ImportRowParser.Parse(JsonDocument.Parse(json).RootElement);

    // ---- string fields ----

    [Fact]
    public void String_fields_taken_verbatim_absent_is_null()
    {
        var row = Parse("""{"code":"MATH1","name":"Algebra","department":"Math","description":"desc"}""");
        Assert.Equal("MATH1", row.Code);
        Assert.Equal("Algebra", row.Name);
        Assert.Equal("Math", row.Department);
        Assert.Equal("desc", row.Description);
        Assert.False(row.RowTypeInvalid);
        Assert.Null(Parse("""{"code":"X","name":"Y"}""").Department); // absent → null
    }

    [Fact]
    public void Empty_string_department_and_description_are_present_falsy_not_invalid()
    {
        var row = Parse("""{"code":"X","name":"Y","department":"","description":""}""");
        Assert.Equal("", row.Department);
        Assert.Equal("", row.Description);
        Assert.False(row.RowTypeInvalid);
    }

    // ---- credits: JS `row.credits ? parseFloat : …` ----

    [Theory]
    [InlineData("""{"code":"X","name":"Y","credits":"3.5"}""", "3.5")]  // string verbatim
    [InlineData("""{"code":"X","name":"Y","credits":3.5}""", "3.5")]    // truthy number → its text (the gate fold)
    [InlineData("""{"code":"X","name":"Y","credits":4}""", "4")]
    public void Credits_string_or_truthy_number_is_carried(string json, string expected)
    {
        var row = Parse(json);
        Assert.Equal(expected, row.Credits);
        Assert.False(row.RowTypeInvalid);
    }

    [Theory]
    [InlineData("""{"code":"X","name":"Y","credits":""}""")]   // "" JS-falsy → skip
    [InlineData("""{"code":"X","name":"Y","credits":0}""")]    // number 0 JS-falsy → skip
    [InlineData("""{"code":"X","name":"Y","credits":null}""")] // null → skip
    [InlineData("""{"code":"X","name":"Y"}""")]                // absent → skip
    public void Credits_falsy_is_null(string json)
    {
        Assert.Null(Parse(json).Credits);
        Assert.False(Parse(json).RowTypeInvalid);
    }

    // ---- RowTypeInvalid (present non-string / non-int scalar → Prisma type reject → row fails) ----

    [Theory]
    [InlineData("""{"code":"X","name":"Y","department":5}""")]         // non-string department
    [InlineData("""{"code":"X","name":"Y","description":42}""")]       // non-string description
    [InlineData("""{"code":"X","name":"Y","credits":true}""")]         // non-string/number credits
    [InlineData("""{"code":"X","name":"Y","gradeLevels":[9,10.5]}""")] // fractional gradeLevel element
    [InlineData("""{"code":"X","name":"Y","gradeLevels":["9"]}""")]    // string gradeLevel element
    public void Non_string_or_non_int_scalars_mark_row_type_invalid(string json)
    {
        Assert.True(Parse(json).RowTypeInvalid);
    }

    // ---- gradeLevels: present array (incl empty) kept ----

    [Fact]
    public void GradeLevels_present_array_kept_absent_is_null()
    {
        Assert.Equal([9, 10], Parse("""{"code":"X","name":"Y","gradeLevels":[9,10]}""").GradeLevels!);
        Assert.Empty(Parse("""{"code":"X","name":"Y","gradeLevels":[]}""").GradeLevels!); // empty [] is JS-truthy → kept
        Assert.Null(Parse("""{"code":"X","name":"Y"}""").GradeLevels);                   // absent → null
    }

    [Fact]
    public void RawJson_preserves_the_original_row_verbatim()
    {
        const string json = """{"code":"X","name":"Y","extra":"kept"}""";
        Assert.Equal(json, Parse(json).RawJson);
    }
}
