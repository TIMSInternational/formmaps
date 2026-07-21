using System.Text.Json;
using FormMaps.Application.SchoolProfile;

namespace FormMaps.UnitTests.SchoolProfile;

/// <summary>
/// Pure allow-list / mass-assignment-guard parity for buildSchoolProfileUpdate (FM-DOTNET-051). No DB. Pins: only
/// the six bounded scalars + email→contactEmail + address are ever emitted (unknown keys — adminEmail, maxStudents,
/// plan, id, isActive — are NEVER written); non-string scalars are skipped; strings are sliced to bound; email
/// ""→clear-to-null, valid→set (sliced 200), invalid-non-empty→ignored, present-non-string→clear; address is a full
/// jsonb replace (omitted fields dropped, non-array/non-null object only).
/// </summary>
public class SchoolProfileUpdateBuilderTests
{
    private static IReadOnlyList<SchoolProfileColumn> Build(string json) =>
        SchoolProfileUpdateBuilder.Build(JsonDocument.Parse(json).RootElement);

    private static SchoolProfileColumn? Col(IReadOnlyList<SchoolProfileColumn> cols, string name) =>
        cols.FirstOrDefault(c => c.Column == name);

    // ---- allow-list / mass-assignment guard ----

    [Fact]
    public void Unknown_keys_are_never_written()
    {
        var cols = Build("""
            {
              "adminEmail": "attacker@evil.test",
              "maxStudents": 99999,
              "plan": "Enterprise",
              "id": "some-other-school",
              "isActive": false,
              "status": "active",
              "createdBy": "x",
              "name": "Legit School"
            }
            """);

        // ONLY the allow-listed `name` survives; every unlisted key is dropped.
        Assert.Equal(["name"], cols.Select(c => c.Column).ToArray());
        Assert.Equal("Legit School", Col(cols, "name")!.Value);
    }

    [Fact]
    public void Empty_body_produces_no_columns()
    {
        Assert.Empty(Build("{}"));
    }

    [Fact]
    public void Non_object_body_produces_no_columns()
    {
        Assert.Empty(Build("[]"));
        Assert.Empty(Build("\"hi\""));
        Assert.Empty(Build("null"));
    }

    // ---- scalar bounds + type skipping ----

    [Fact]
    public void All_six_scalars_written_when_strings()
    {
        var cols = Build("""
            {"name":"N","details":"D","phone":"P","website":"W","timezone":"TZ","logoUrl":"L"}
            """);
        Assert.Equal(
            new HashSet<string> { "name", "details", "phone", "website", "timezone", "logoUrl" },
            cols.Select(c => c.Column).ToHashSet());
    }

    [Theory]
    [InlineData("""{"name":123}""")]
    [InlineData("""{"name":true}""")]
    [InlineData("""{"name":null}""")]
    [InlineData("""{"name":{"x":1}}""")]
    [InlineData("""{"name":["a"]}""")]
    public void Non_string_scalar_is_skipped(string json)
    {
        Assert.Null(Col(Build(json), "name"));
    }

    [Fact]
    public void Strings_are_sliced_to_bound()
    {
        var longName = new string('a', 250);
        var cols = Build($$"""{"name":"{{longName}}"}""");
        Assert.Equal(200, ((string)Col(cols, "name")!.Value!).Length);

        var longPhone = new string('9', 80);
        var phoneCols = Build($$"""{"phone":"{{longPhone}}"}""");
        Assert.Equal(50, ((string)Col(phoneCols, "phone")!.Value!).Length);
    }

    // ---- email → contactEmail ----

    [Fact]
    public void Email_empty_clears_contactEmail_to_null()
    {
        var col = Col(Build("""{"email":""}"""), "contactEmail");
        Assert.NotNull(col);
        Assert.Null(col!.Value); // explicit clear → NULL
    }

    [Fact]
    public void Email_whitespace_only_clears_to_null()
    {
        var col = Col(Build("""{"email":"   "}"""), "contactEmail");
        Assert.NotNull(col);
        Assert.Null(col!.Value); // trims to "" → clear
    }

    [Fact]
    public void Email_valid_sets_contactEmail_trimmed()
    {
        var col = Col(Build("""{"email":"  Ada@example.com  "}"""), "contactEmail");
        Assert.NotNull(col);
        Assert.Equal("Ada@example.com", col!.Value);
    }

    [Fact]
    public void Email_valid_is_sliced_to_200()
    {
        var local = new string('a', 260);
        var col = Col(Build($$"""{"email":"{{local}}@example.com"}"""), "contactEmail");
        Assert.NotNull(col);
        Assert.Equal(200, ((string)col!.Value!).Length);
    }

    [Theory]
    [InlineData("andres@localhost")]  // no dotted domain
    [InlineData("andres@")]           // no domain
    [InlineData("andres")]            // no @
    [InlineData("an dres@example.com")] // whitespace
    [InlineData("mailto:a@example.com")] // colon rejected
    public void Email_invalid_non_empty_is_ignored(string email)
    {
        var col = Col(Build($$"""{"email":"{{email}}"}"""), "contactEmail");
        Assert.Null(col); // not written at all
    }

    [Fact]
    public void Email_present_but_non_string_clears_to_null()
    {
        // Legacy `typeof body.email === "string" ? trim : ""` → a present non-string collapses to "" → clear.
        var col = Col(Build("""{"email":42}"""), "contactEmail");
        Assert.NotNull(col);
        Assert.Null(col!.Value);
    }

    // ---- address full-replace ----

    [Fact]
    public void Address_full_object_written_as_jsonb()
    {
        var cols = Build("""
            {"address":{"street":"1 A St","city":"Townsville","state":"CA","country":"US","postalCode":"90000"}}
            """);
        var col = Col(cols, "address");
        Assert.NotNull(col);
        Assert.True(col!.IsJsonb);
        using var doc = JsonDocument.Parse((string)col.Value!);
        Assert.Equal("1 A St", doc.RootElement.GetProperty("street").GetString());
        Assert.Equal("90000", doc.RootElement.GetProperty("postalCode").GetString());
    }

    [Fact]
    public void Address_partial_drops_omitted_and_non_string_fields()
    {
        var cols = Build("""
            {"address":{"street":"1 A St","city":123,"state":null,"unknownField":"x"}}
            """);
        var col = Col(cols, "address");
        Assert.NotNull(col);
        using var doc = JsonDocument.Parse((string)col!.Value!);
        // Only the string `street` survives; non-string city/state and the unknown sub-field are dropped.
        Assert.Single(doc.RootElement.EnumerateObject());
        Assert.Equal("1 A St", doc.RootElement.GetProperty("street").GetString());
    }

    [Fact]
    public void Address_sub_fields_sliced_to_200()
    {
        var longStreet = new string('s', 250);
        var cols = Build("{\"address\":{\"street\":\"" + longStreet + "\"}}");
        using var doc = JsonDocument.Parse((string)Col(cols, "address")!.Value!);
        Assert.Equal(200, doc.RootElement.GetProperty("street").GetString()!.Length);
    }

    [Theory]
    [InlineData("""{"address":null}""")]
    [InlineData("""{"address":["a","b"]}""")]
    [InlineData("""{"address":"123 St"}""")]
    [InlineData("""{"address":42}""")]
    public void Address_non_object_is_ignored(string json)
    {
        Assert.Null(Col(Build(json), "address"));
    }

    [Fact]
    public void Address_empty_object_writes_empty_jsonb()
    {
        var col = Col(Build("""{"address":{}}"""), "address");
        Assert.NotNull(col);
        using var doc = JsonDocument.Parse((string)col!.Value!);
        Assert.Empty(doc.RootElement.EnumerateObject());
    }
}
