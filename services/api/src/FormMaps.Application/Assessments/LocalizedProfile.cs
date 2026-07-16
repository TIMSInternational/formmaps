namespace FormMaps.Application.Assessments;

/// <summary>Career/social potential text pair (camelCase: social/laboral).</summary>
public sealed record PersonalityPotential(string Social, string Laboral);

/// <summary>Coaching guidance (camelCase: objective/practices).</summary>
public sealed record PersonalityCoaching(string Objective, IReadOnlyList<string> Practices);

/// <summary>
/// A personality profile projected into a single language — the port of legacy
/// <c>LocalizedProfile</c> (personality-bank.ts). Serialized camelCase, matching the legacy wire shape.
/// </summary>
public sealed record LocalizedProfile(
    string Type,
    string Alias,
    string Tagline,
    string Description,
    IReadOnlyList<string> Strengths,
    IReadOnlyList<string> Weaknesses,
    IReadOnlyList<string> ImprovementAreas,
    IReadOnlyList<string> HowToDevelop,
    IReadOnlyList<string> Motivation,
    IReadOnlyList<string> HowToWorkWith,
    IReadOnlyList<string> Communication,
    PersonalityPotential Potential,
    PersonalityCoaching CoachingStrategy);
