using System.Text.Json;
using FormMaps.Application.CommunityService;

namespace FormMaps.UnitTests.CommunityService;

/// <summary>
/// Pins the zod create/updateCommunityServiceSchema port (routes/student.ts): required organization/hours/date on
/// create; the date .refine() (valid AND non-future, via injected now); z.string().email(); the update top-level
/// .refine("At least one field is required"); and the FIRST failing field's message in declaration order.
/// </summary>
public sealed class CommunityServiceValidationTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 23, 12, 0, 0, TimeSpan.Zero);

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static CommunityServiceValidationResult Create(string json) => CommunityServiceValidation.ValidateCreate(Body(json), Now);

    private static CommunityServiceUpdateResult Update(string json) => CommunityServiceValidation.ValidateUpdate(Body(json), Now);

    [Fact]
    public void Create_requires_organization()
    {
        var r = Create("{}");
        Assert.False(r.Success);
        Assert.Equal("Required", r.Message);
    }

    [Fact]
    public void Create_requires_hours_after_organization()
    {
        var r = Create("""{"organization":"Red Cross"}""");
        Assert.False(r.Success);
        Assert.Equal("Required", r.Message); // hours missing
    }

    [Fact]
    public void Create_accepts_valid_body()
    {
        var r = Create("""{"organization":"Red Cross","hours":8,"date":"2026-06-01","supervisorEmail":"sup@example.com"}""");
        Assert.True(r.Success);
        Assert.Equal("Red Cross", r.Input!.Organization);
        Assert.Equal(8m, r.Input.Hours);
        Assert.True(r.Input.HasSupervisorEmail);
        Assert.Equal("sup@example.com", r.Input.SupervisorEmail);
    }

    [Theory]
    [InlineData("""{"organization":"","hours":8,"date":"2026-06-01"}""", "String must contain at least 1 character(s)")]
    [InlineData("""{"organization":"o","hours":-1,"date":"2026-06-01"}""", "Number must be greater than or equal to 0")]
    [InlineData("""{"organization":"o","hours":20000,"date":"2026-06-01"}""", "Number must be less than or equal to 10000")]
    public void Create_field_validation(string json, string message)
    {
        var r = Create(json);
        Assert.False(r.Success);
        Assert.Equal(message, r.Message);
    }

    [Theory]
    [InlineData("""{"organization":"o","hours":8,"date":"2099-01-01"}""")]  // future
    [InlineData("""{"organization":"o","hours":8,"date":"not-a-date"}""")]  // unparseable
    public void Create_date_refine_rejects_future_and_invalid(string json)
    {
        var r = Create(json);
        Assert.False(r.Success);
        Assert.Equal("Date must be a valid, non-future date", r.Message);
    }

    [Fact]
    public void Create_date_non_string_is_type_error()
    {
        var r = Create("""{"organization":"o","hours":8,"date":5}""");
        Assert.False(r.Success);
        Assert.Equal("Expected string, received number", r.Message);
    }

    [Theory]
    [InlineData("not-an-email", "Invalid email")]
    public void Create_email_validation(string email, string message)
    {
        var r = Create($$"""{"organization":"o","hours":8,"date":"2026-06-01","supervisorEmail":"{{email}}"}""");
        Assert.False(r.Success);
        Assert.Equal(message, r.Message);
    }

    [Fact]
    public void Update_empty_body_requires_at_least_one_field()
    {
        var r = Update("{}");
        Assert.False(r.Success);
        Assert.Equal("At least one field is required", r.Message);
    }

    [Fact]
    public void Update_single_field_ok()
    {
        var r = Update("""{"hours":5}""");
        Assert.True(r.Success);
        Assert.True(r.Patch!.HasHours);
        Assert.Equal(5m, r.Patch.Hours);
        Assert.False(r.Patch.HasOrganization);
    }

    [Fact]
    public void Update_field_error_wins_over_refine()
    {
        var r = Update("""{"organization":""}""");
        Assert.False(r.Success);
        Assert.Equal("String must contain at least 1 character(s)", r.Message); // not the at-least-one refine
    }

    [Theory]
    [InlineData("5", "Expected object, received number")]
    [InlineData("[]", "Expected object, received array")]
    public void Create_non_object_rejected(string json, string message)
    {
        var r = Create(json);
        Assert.False(r.Success);
        Assert.Equal(message, r.Message);
    }
}
