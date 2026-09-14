namespace FormMaps.Application.Billing;

/// <summary>
/// A shadow-rail write hit a unique constraint that is NOT another delivery of the same Stripe event —
/// genuinely conflicting state, such as the same <c>stripeSubscriptionId</c> arriving for a different
/// <c>userId</c>. Retrying cannot resolve it, which is what separates it from the transient database
/// faults a caller SHOULD let Stripe retry.
/// </summary>
/// <remarks>
/// formmaps#188. <see cref="IBillingShadowRepository" /> classifies a unique violation itself: a loser in a
/// concurrent-redelivery race returns the documented <c>false</c>, and only what is left over — a permanent
/// conflict — surfaces as this. Callers can therefore tell "cannot ever succeed" from "try again later"
/// without reaching for the database driver's error codes, which is why this is a domain type and not a
/// leaked <c>PostgresException</c>.
/// <para><see cref="ConstraintName" /> is carried deliberately: it is the one fact that tells a
/// subscription-id collision from an event-id collision, and it is what an operator needs to act on.</para>
/// </remarks>
public sealed class BillingShadowConflictException(
    string eventId, string eventType, string? constraintName, Exception innerException)
    : Exception(
        $"Shadow billing write for event '{eventId}' ({eventType}) conflicts with existing shadow state "
        + $"(constraint: {constraintName ?? "unknown"}).",
        innerException)
{
    public string EventId { get; } = eventId;

    public string EventType { get; } = eventType;

    /// <summary>The violated index, when the driver reported one.</summary>
    public string? ConstraintName { get; } = constraintName;
}
