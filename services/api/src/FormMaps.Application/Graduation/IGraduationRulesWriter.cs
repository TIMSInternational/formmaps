using FormMaps.Application.Auth;

namespace FormMaps.Application.Graduation;

/// <summary>
/// Writes for the graduation rule set (POST/PUT /graduation/rules). Both run in ONE writable session under the
/// caller's RLS GUCs and commit at the end — legacy's PUT is already a single <c>$transaction</c> for the exact
/// reason spelled out in its comment: the delete-and-recreate of the child rows must not be able to erase a
/// rule set halfway through.
/// </summary>
public interface IGraduationRulesWriter
{
    /// <summary>
    /// createGraduationRules. When no academicYearId is supplied it uses the school's current year, CREATING a
    /// default "2025-2026" year when the school has none — a real side effect of a rules POST, ported as written.
    /// </summary>
    Task<string> CreateRulesAsync(
        RequestContext context, string schoolId, CreateGraduationRulesInput input, CancellationToken cancellationToken = default);

    /// <summary>
    /// updateGraduationRules. Returns false when the rule set does not exist or belongs to another school (the
    /// endpoint maps that to 404 "Rule set not found"); the ownership check happens BEFORE any write.
    /// </summary>
    Task<bool> UpdateRulesAsync(
        RequestContext context, string schoolId, string actorId, string ruleSetId, UpdateGraduationRulesInput input,
        CancellationToken cancellationToken = default);
}
