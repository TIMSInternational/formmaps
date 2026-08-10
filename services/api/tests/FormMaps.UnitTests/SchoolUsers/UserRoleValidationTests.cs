using System.Text.Json;
using FormMaps.Application.SchoolUsers;

namespace FormMaps.UnitTests.SchoolUsers;

/// <summary>
/// Pins <see cref="UserRoleValidation"/> against zod's <c>userRoleSchema</c> (routes/school.ts, formmaps#114):
/// the field name, <c>.strict()</c>, the allowlist enum, the max(50)-before-toLowerCase-before-enum ordering, and
/// the issue ordering that decides which message <c>errors[0].message</c> actually is.
/// </summary>
public class UserRoleValidationTests
{
    private const string EnumMessagePrefix = "Invalid enum value. Expected 'counselor' | 'teacher' | 'staff' | 'coach', received ";

    private static UserRoleValidationResult Validate(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return UserRoleValidation.Validate(doc.RootElement.Clone());
    }

    [Theory]
    [InlineData("counselor")]
    [InlineData("teacher")]
    [InlineData("staff")]
    [InlineData("coach")]
    public void Every_allowlisted_role_is_accepted(string role)
    {
        var result = Validate($$"""{"roleName":"{{role}}"}""");
        Assert.True(result.Ok);
        Assert.Equal(role, result.RoleName);
    }

    // .toLowerCase() is a transform between .max(50) and the piped enum, so mixed case is VALID and arrives
    // lowercased. Invariant lowercasing: a culture-sensitive ToLower() would map 'I' to a dotless ı on a tr-TR
    // host and reject a role that zod accepts.
    [Theory]
    [InlineData("Counselor", "counselor")]
    [InlineData("TEACHER", "teacher")]
    [InlineData("StAfF", "staff")]
    public void Case_is_folded_before_the_enum(string sent, string expected)
    {
        var result = Validate($$"""{"roleName":"{{sent}}"}""");
        Assert.True(result.Ok);
        Assert.Equal(expected, result.RoleName);
    }

    // The privilege-escalation allowlist: this is what stops a school admin minting another school_admin, and what
    // stops a staff row being flipped into a student (gradeLevel / assignments / assessment data would be orphaned).
    [Theory]
    [InlineData("school_admin")]
    [InlineData("Super Admin")]
    [InlineData("student")]
    [InlineData("parent")]
    [InlineData("")]
    public void Roles_outside_the_allowlist_are_rejected(string role)
    {
        var result = Validate($$"""{"roleName":"{{role}}"}""");
        Assert.False(result.Ok);
        Assert.Equal($"{EnumMessagePrefix}'{role.ToLowerInvariant()}'", result.Message);
    }

    [Fact]
    public void Field_is_roleName_not_role_and_the_mistake_is_loud()
    {
        // formmaps#79 verbatim — apps/web was posting { role } here. A lenient object would strip it silently.
        var result = Validate("""{"role":"teacher"}""");
        Assert.False(result.Ok);
        Assert.Equal("Required", result.Message);
    }

    [Fact]
    public void Extra_keys_alongside_a_valid_roleName_are_rejected_by_strict()
    {
        var result = Validate("""{"roleName":"teacher","schoolId":"s-1"}""");
        Assert.False(result.Ok);
        Assert.Equal("Unrecognized key(s) in object: 'schoolId'", result.Message);
    }

    [Fact]
    public void Multiple_extra_keys_are_joined_the_way_zod_joins_them()
    {
        var result = Validate("""{"roleName":"teacher","a":1,"b":2}""");
        Assert.False(result.Ok);
        Assert.Equal("Unrecognized key(s) in object: 'a', 'b'", result.Message);
    }

    [Fact]
    public void A_shape_issue_outranks_the_unrecognized_key_issue()
    {
        // zod's ZodObject._parse runs the per-key validators in the `pairs` loop BEFORE the strict extra-key check,
        // so errors[0] is roleName's issue even though `role` is also unrecognized. If this ever flips, the client
        // starts seeing a different 400 message for the single most likely malformed body.
        var result = Validate("""{"role":"teacher","other":1}""");
        Assert.False(result.Ok);
        Assert.Equal("Required", result.Message);
    }

    [Fact]
    public void Max_50_is_checked_before_the_enum()
    {
        var result = Validate($$"""{"roleName":"{{new string('a', 51)}}"}""");
        Assert.False(result.Ok);
        Assert.Equal("String must contain at most 50 character(s)", result.Message);
    }

    [Theory]
    [InlineData("""{"roleName":123}""", "Expected string, received number")]
    [InlineData("""{"roleName":null}""", "Expected string, received null")]
    [InlineData("""{"roleName":true}""", "Expected string, received boolean")]
    [InlineData("""{"roleName":["teacher"]}""", "Expected string, received array")]
    public void Non_string_roleName_is_an_invalid_type_issue(string json, string message)
    {
        var result = Validate(json);
        Assert.False(result.Ok);
        Assert.Equal(message, result.Message);
    }

    [Theory]
    [InlineData("[]", "Expected object, received array")]
    [InlineData("7", "Expected object, received number")]
    [InlineData("null", "Expected object, received null")]
    public void Non_object_body_is_an_invalid_type_issue(string json, string message)
    {
        var result = Validate(json);
        Assert.False(result.Ok);
        Assert.Equal(message, result.Message);
    }
}
