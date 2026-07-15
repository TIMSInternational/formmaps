using FormMaps.Application.Auth;

namespace FormMaps.Infrastructure.Data;

public static class RlsSessionCommandBuilder
{
    public static IReadOnlyList<RlsSessionStatement> Build(TenantGucPlan plan, bool readOnly)
    {
        var statements = new List<RlsSessionStatement>();

        if (readOnly)
        {
            statements.Add(new RlsSessionStatement(
                "SET TRANSACTION READ ONLY",
                new Dictionary<string, object?>()));
        }

        statements.Add(plan.Mode switch
        {
            TenantGucPlanMode.Bypass => new RlsSessionStatement(
                "SELECT set_config('app.bypass_rls', @bypass, true)",
                new Dictionary<string, object?> { ["bypass"] = "on" }),
            TenantGucPlanMode.Deny => new RlsSessionStatement(
                "SELECT set_config('app.bypass_rls', @bypass, true)",
                new Dictionary<string, object?> { ["bypass"] = "off" }),
            TenantGucPlanMode.Identity => new RlsSessionStatement(
                "SELECT set_config('app.current_school_id', @schoolId, true), set_config('app.current_user_id', @userId, true)",
                new Dictionary<string, object?>
                {
                    ["schoolId"] = plan.SchoolId ?? string.Empty,
                    ["userId"] = plan.UserId ?? string.Empty
                }),
            _ => throw new InvalidOperationException($"Unsupported RLS plan mode: {plan.Mode}")
        });

        return statements;
    }
}
