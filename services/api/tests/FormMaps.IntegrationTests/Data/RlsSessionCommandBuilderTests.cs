using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;

namespace FormMaps.IntegrationTests.Data;

public class RlsSessionCommandBuilderTests
{
    [Fact]
    public void Build_sets_read_only_transaction_before_identity_gucs()
    {
        var statements = RlsSessionCommandBuilder.Build(
            TenantGucPlan.Identity("school-123", "user-123"),
            readOnly: true);

        Assert.Collection(
            statements,
            statement => Assert.Equal("SET TRANSACTION READ ONLY", statement.CommandText),
            statement =>
            {
                Assert.Equal(
                    "SELECT set_config('app.current_school_id', @schoolId, true), set_config('app.current_user_id', @userId, true)",
                    statement.CommandText);
                Assert.Equal("school-123", statement.Parameters["schoolId"]);
                Assert.Equal("user-123", statement.Parameters["userId"]);
            });
    }

    [Fact]
    public void Build_uses_empty_school_id_for_no_school_identity()
    {
        var statement = Assert.Single(RlsSessionCommandBuilder.Build(
            TenantGucPlan.Identity(string.Empty, "user-123"),
            readOnly: false));

        Assert.Equal(string.Empty, statement.Parameters["schoolId"]);
        Assert.Equal("user-123", statement.Parameters["userId"]);
    }

    [Fact]
    public void Build_bypass_sets_bypass_rls_on()
    {
        var statement = Assert.Single(RlsSessionCommandBuilder.Build(
            TenantGucPlan.Bypass(),
            readOnly: false));

        Assert.Equal("SELECT set_config('app.bypass_rls', @bypass, true)", statement.CommandText);
        Assert.Equal("on", statement.Parameters["bypass"]);
    }

    [Fact]
    public void Build_deny_sets_bypass_rls_off()
    {
        var statement = Assert.Single(RlsSessionCommandBuilder.Build(
            TenantGucPlan.Deny(),
            readOnly: false));

        Assert.Equal("SELECT set_config('app.bypass_rls', @bypass, true)", statement.CommandText);
        Assert.Equal("off", statement.Parameters["bypass"]);
    }
}
