using System.Text.Json;
using FormMaps.Application.SchoolUsers;

namespace FormMaps.UnitTests.SchoolUsers;

/// <summary>
/// The <c>.strict()</c> parity half of formmaps#114, and the single likeliest place for the two backends to diverge
/// into a privilege bug.
///
/// <para>Node gets strictness from <c>z.object({ roleName: … }).strict()</c>. System.Text.Json IGNORES unknown
/// properties by default — which IS the pre-formmaps#79 failure mode: the frontend sent <c>{ role }</c> where the
/// server read <c>roleName</c>, the unknown key was stripped, and the handler fell through to a default that granted
/// a role nobody asked for. Every assertion below is the .NET twin of a case in
/// api/src/__tests__/school-user-role-contract.test.ts.</para>
/// </summary>
public class RoleChangeRequestTests
{
    private static RoleChangeParse Parse(string json) =>
        RoleChangeRequest.Parse(JsonDocument.Parse(json).RootElement);

    [Fact]
    public void REJECTS_the_payload_the_frontend_was_already_sending()
    {
        // `{ "role": "staff" }` — formmaps#79 verbatim. This must be a loud 400, never a silent default.
        var result = Parse("""{"role":"staff"}""");
        Assert.Null(result.RoleName);
        Assert.NotNull(result.Error);
    }

    [Fact]
    public void REJECTS_roleName_smuggled_alongside_an_extra_key()
    {
        // The extra-property check runs BEFORE the roleName lookup precisely so a happy-path value cannot carry a
        // second field past it.
        var result = Parse("""{"roleName":"staff","role":"school_admin"}""");
        Assert.Null(result.RoleName);
        Assert.Contains("Unrecognized key", result.Error);
    }

    [Theory]
    [InlineData("""{"roleName":"counselor"}""", "counselor")]
    [InlineData("""{"roleName":"teacher"}""", "teacher")]
    [InlineData("""{"roleName":"staff"}""", "staff")]
    [InlineData("""{"roleName":"coach"}""", "coach")]
    [InlineData("""{"roleName":"Teacher"}""", "teacher")]   // zod's .toLowerCase() runs before the enum
    public void Accepts_every_staff_role_case_insensitively(string json, string expected)
    {
        var result = Parse(json);
        Assert.Null(result.Error);
        Assert.Equal(expected, result.RoleName);
    }

    /// <summary>
    /// The parity case this file previously had BACKWARDS (formmaps#114 review).
    ///
    /// <para>It used to assert that <c>{"roleName":"  COACH  "}</c> parses to "coach", pinning a
    /// <c>.Trim()</c> the Node twin does not have: <c>z.string().max(50).toLowerCase().pipe(z.enum(…))</c>
    /// case-folds but never trims, so Node returns 400 for this exact body. Flipping
    /// FORMMAPS_ROUTE_SCHOOL_USERS_TO_DOTNET therefore turned a hard reject into a successful role change
    /// — on the one endpoint whose entire purpose is refusing role changes it should not make.</para>
    ///
    /// <para>Padded input is now rejected on BOTH backends, and this test exists so the trim cannot come
    /// back as a "usability fix" without a failing test spelling out what it costs.</para>
    /// </summary>
    [Theory]
    [InlineData("""{"roleName":"  COACH  "}""")]
    [InlineData("""{"roleName":" coach"}""")]
    [InlineData("""{"roleName":"coach "}""")]
    public void Rejects_whitespace_padded_roles_because_zod_does_not_trim(string json)
    {
        var result = Parse(json);
        Assert.Equal("Invalid role", result.Error);
        Assert.Null(result.RoleName);
    }

    /// <summary>
    /// Length is measured on the RAW string, before case-folding, because zod's <c>.max(50)</c> sits
    /// ahead of <c>.toLowerCase()</c> in the chain. Normalising first would admit a padded
    /// 51-character value that Node rejects on length — the same divergence in a subtler shape.
    /// </summary>
    [Fact]
    public void Measures_length_on_the_raw_string_not_the_normalized_one()
    {
        var padded = new string(' ', 46) + "coach";   // 51 raw characters; 5 after a trim
        var result = Parse($$"""{"roleName":"{{padded}}"}""");
        Assert.Equal("Invalid role", result.Error);
        Assert.Null(result.RoleName);
    }

    [Theory]
    [InlineData("""{"roleName":"school_admin"}""")]   // THE escalation this endpoint exists to prevent
    [InlineData("""{"roleName":"School_Admin"}""")]
    [InlineData("""{"roleName":"Super Admin"}""")]
    [InlineData("""{"roleName":"admin"}""")]
    [InlineData("""{"roleName":"student"}""")]
    [InlineData("""{"roleName":"parent"}""")]
    [InlineData("""{"roleName":""}""")]
    [InlineData("""{"roleName":"wizard"}""")]
    public void REFUSES_to_hand_out_a_privileged_or_student_role(string json)
    {
        var result = Parse(json);
        Assert.Null(result.RoleName);
        Assert.Equal("Invalid role", result.Error);
    }

    [Theory]
    [InlineData("""{}""")]                       // absent roleName — never means "use the default"
    [InlineData("""{"roleName":null}""")]        // JSON null is not a string
    [InlineData("""{"roleName":42}""")]          // number is not a string
    [InlineData("""{"roleName":["staff"]}""")]   // array is not a string
    [InlineData("""{"roleName":{"v":"staff"}}""")]
    [InlineData("""[]""")]                       // non-object root
    [InlineData("\"staff\"")]                    // bare string root
    [InlineData("""null""")]
    public void REJECTS_a_body_that_is_not_an_object_carrying_a_string_roleName(string json)
    {
        var result = Parse(json);
        Assert.Null(result.RoleName);
        Assert.NotNull(result.Error);
    }

    [Fact]
    public void REJECTS_a_malformed_body()
    {
        // The endpoint's ReadBodyAsync hands null through for unparseable JSON → the house 400.
        var result = RoleChangeRequest.Parse(null);
        Assert.Null(result.RoleName);
        Assert.Equal("Invalid request body", result.Error);
    }

    [Fact]
    public void REJECTS_an_over_long_value_matching_the_zod_max_50()
    {
        var result = Parse($$"""{"roleName":"{{new string('c', 51)}}"}""");
        Assert.Null(result.RoleName);
        Assert.Equal("Invalid role", result.Error);
    }

    [Fact]
    public void The_allowlist_is_exactly_the_four_staff_roles_no_more()
    {
        // Pinned as a set so "just add school_admin, the UI needs it" cannot land unnoticed.
        Assert.Equal(
            new[] { "coach", "counselor", "staff", "teacher" },
            RoleChangeRequest.AllowedRoles.OrderBy(r => r, StringComparer.Ordinal).ToArray());
    }
}
