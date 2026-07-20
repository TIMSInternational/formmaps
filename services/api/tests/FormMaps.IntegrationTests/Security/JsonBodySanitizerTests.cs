using FormMaps.Api.Security;
using Xunit;

namespace FormMaps.IntegrationTests.Security;

/// <summary>
/// Regression guard for the JsonBodySanitizer array-of-strings bug (FM-045): sanitizing a string element calls
/// JsonNode.ReplaceWith(), which mutates the array — enumerating the JsonArray directly threw "Collection was
/// modified". Latent until a request body carried a top-level string array (e.g. send-reminders' studentIds).
/// </summary>
public sealed class JsonBodySanitizerTests
{
    [Fact]
    public void Sanitize_string_array_does_not_throw_and_strips_html()
    {
        var input = """{"studentIds":["s1","<b>s2</b>","s3"],"assessmentTypes":["PCA"]}""";

        var output = JsonBodySanitizer.SanitizeJson(input); // pre-fix: throws InvalidOperationException

        Assert.Contains("\"s1\"", output);
        Assert.Contains("\"s2\"", output);   // <b>/</b> stripped
        Assert.DoesNotContain("<b>", output);
        Assert.Contains("\"PCA\"", output);
    }

    [Fact]
    public void Sanitize_nested_string_arrays_and_objects_are_stable()
    {
        var input = """{"a":["<i>x</i>"],"b":{"c":["y","<script>z</script>"]}}""";

        var output = JsonBodySanitizer.SanitizeJson(input);

        Assert.DoesNotContain("<i>", output);
        Assert.DoesNotContain("<script>", output);
        Assert.Contains("\"y\"", output);
    }
}
