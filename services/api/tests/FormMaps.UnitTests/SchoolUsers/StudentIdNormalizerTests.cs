using System.Text.Json;
using FormMaps.Application.SchoolUsers;

namespace FormMaps.UnitTests.SchoolUsers;

/// <summary>
/// Pins legacy normalizeStudentIds (schoolService.ts:154-163): every element must be a non-empty (post-trim) JSON
/// string, else the whole call errors "studentIds[] must contain student ids"; passing values are trimmed and
/// deduped (insertion order preserved). A number / null / empty-string / boolean / object element all trip the error.
/// </summary>
public class StudentIdNormalizerTests
{
    private const string Error = "studentIds[] must contain student ids";

    private static StudentIdNormalization Normalize(string arrayJson) =>
        StudentIdNormalizer.Normalize(JsonDocument.Parse(arrayJson).RootElement.EnumerateArray().ToList());

    [Fact]
    public void Trims_and_dedups_preserving_insertion_order()
    {
        var result = Normalize("""[" a ", "b", "a", "c ", "b"]""");
        Assert.Null(result.Error);
        Assert.Equal(new[] { "a", "b", "c" }, result.Ids);
    }

    [Fact]
    public void Empty_array_is_ok_with_no_ids()
    {
        var result = Normalize("[]");
        Assert.Null(result.Error);
        Assert.Empty(result.Ids);
    }

    [Theory]
    [InlineData("""["ok", 123]""")]      // number element
    [InlineData("""["ok", null]""")]     // null element
    [InlineData("""["ok", ""]""")]       // empty-string element
    [InlineData("""["ok", "   "]""")]    // whitespace-only → empty after trim
    [InlineData("""["ok", true]""")]     // boolean element
    [InlineData("""["ok", {}]""")]       // object element
    [InlineData("""["ok", ["x"]]""")]    // array element
    public void Non_string_or_empty_element_errors(string arrayJson)
    {
        var result = Normalize(arrayJson);
        Assert.Equal(Error, result.Error);
        Assert.Empty(result.Ids);
    }
}
