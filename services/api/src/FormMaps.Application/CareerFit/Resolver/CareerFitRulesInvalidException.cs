namespace FormMaps.Application.CareerFit.Resolver;

// FM-CF-009. The fail-closed signal of the rules resolver: one exception carrying EVERY problem the
// resolver found (never the first one only, never a truncated list), each problem naming the family
// (or archetype) and the field it lives in, so TIMS can fix the rule set cell by cell from one message.

/// <summary>
/// One thing wrong with a rule set. At most one of <see cref="FamilyId"/> / <see cref="ArchetypeId"/> is
/// set (archetype problems belong to the catalogue, not to a family; both null means the document
/// itself, e.g. its rules_version). <see cref="Field"/> is the JSON-path-like member inside that owner
/// ("mil_rules.RZ", "pca_routes[NO_SUCH_ROUTE]", "factors.D").
/// </summary>
public sealed record CareerFitRulesProblem(int? FamilyId, string? ArchetypeId, string Field, string Message)
{
    /// <summary>"family 1: mil_rules.RZ: …" / "archetype ASESOR: factors.D: …" — the check_resolved() wording.</summary>
    public override string ToString()
    {
        var owner = FamilyId is { } id ? $"family {id}"
            : ArchetypeId is not null ? $"archetype {ArchetypeId}"
            : "rule set";
        return $"{owner}: {Field}: {Message}";
    }
}

/// <summary>
/// Thrown when a rule set fails the resolver (tools/careerfit/mc_gate.py check_resolved(), ported). The
/// process must NOT score with this rule set: the provider refuses to expose it and the host refuses to
/// start. <see cref="Problems"/> is the complete list, in the order the checks ran.
/// </summary>
public sealed class CareerFitRulesInvalidException : Exception
{
    public CareerFitRulesInvalidException(string rulesVersion, IReadOnlyList<CareerFitRulesProblem> problems)
        : base(BuildMessage(rulesVersion, problems))
    {
        RulesVersion = rulesVersion;
        Problems = problems;
    }

    /// <summary>The rules_version of the rejected rule set (or the requested version when the file could not say).</summary>
    public string RulesVersion { get; }

    /// <summary>Every problem found; never empty.</summary>
    public IReadOnlyList<CareerFitRulesProblem> Problems { get; }

    private static string BuildMessage(string rulesVersion, IReadOnlyList<CareerFitRulesProblem> problems)
    {
        var count = problems.Count;
        var noun = count == 1 ? "problem" : "problems";
        return $"CareerFit rule set {rulesVersion} failed the resolver with {count} {noun}; " +
               "no scoring may run on it (RESOLVED): " + string.Join("; ", problems.Select(p => p.ToString()));
    }
}
