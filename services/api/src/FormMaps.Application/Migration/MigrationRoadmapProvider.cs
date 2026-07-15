namespace FormMaps.Application.Migration;

public sealed class MigrationRoadmapProvider : IMigrationRoadmapProvider
{
    private static readonly MigrationDomainStatus[] Roadmap =
    [
        new(
            Domain: "platform-health",
            CurrentOwner: ".NET",
            TargetOwner: ".NET",
            FirstMove: "Keep health and version endpoints in the .NET service.",
            Risk: "low",
            Status: "started"),

        new(
            Domain: "request-context-and-tenant",
            CurrentOwner: "legacy-node-api",
            TargetOwner: ".NET",
            FirstMove: "Build auth-compatible request context and fail-closed tenant guard.",
            Risk: "high",
            Status: "planned"),

        new(
            Domain: "audit-events",
            CurrentOwner: "legacy-node-api",
            TargetOwner: ".NET",
            FirstMove: "Add application audit abstraction before persistent audit storage.",
            Risk: "medium",
            Status: "planned"),

        new(
            Domain: "reports-and-dashboards",
            CurrentOwner: "legacy-node-api",
            TargetOwner: ".NET",
            FirstMove: "Implement one read-only reporting endpoint with tenant/role parity tests.",
            Risk: "medium",
            Status: "planned"),

        new(
            Domain: "assessments-and-readiness",
            CurrentOwner: "legacy-node-api",
            TargetOwner: ".NET",
            FirstMove: "Migrate read APIs before scoring or write workflows.",
            Risk: "high",
            Status: "planned"),

        new(
            Domain: "schools-rosters-organizations",
            CurrentOwner: "legacy-node-api",
            TargetOwner: ".NET",
            FirstMove: "Migrate read-only school and roster queries before writes.",
            Risk: "medium",
            Status: "planned"),

        new(
            Domain: "student-counselor-parent-workflows",
            CurrentOwner: "legacy-node-api",
            TargetOwner: ".NET",
            FirstMove: "Migrate assignment-scoped and own-record read APIs first.",
            Risk: "high",
            Status: "planned"),

        new(
            Domain: "billing-and-integrations",
            CurrentOwner: "legacy-node-api",
            TargetOwner: ".NET",
            FirstMove: "Defer until core identity, tenant context, and reporting cutover are stable.",
            Risk: "high",
            Status: "deferred")
    ];

    public IReadOnlyList<MigrationDomainStatus> GetRoadmap()
    {
        return Roadmap;
    }
}
