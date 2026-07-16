namespace FormMaps.Application.Reports;

/// <summary>
/// Reproduces the legacy GET /coaching/:userId response payload (api/src/routes/report.ts).
/// The booking-&gt;coach join returns ONLY the whitelisted columns; sensitive booking fields
/// (paymentIntentId, coachNotes, notes, meetingLink, cancellationReason) and coach fields
/// (hourlyRate, platformCommission, email) must never appear.
/// <see cref="TotalSpent"/> sums the amount (BigInt) over COMPLETED bookings only.
/// </summary>
public sealed record CoachingReport(
    string StudentId,
    string StudentName,
    int TotalSessions,
    int CompletedSessions,
    long TotalSpent,
    string Currency,
    int ReviewsGiven,
    IReadOnlyList<CoachingSession> Sessions,
    DateTimeOffset GeneratedAt);

/// <summary>
/// A single coaching session. <see cref="Amount"/> is a BigInt read as long? and emitted as a
/// JSON number; matching legacy `b.amount ? Number(b.amount) : null`, a null OR zero DB amount
/// is emitted as null (BigInt 0n is falsy in JS).
/// </summary>
public sealed record CoachingSession(
    string Id,
    string CoachName,
    string CoachSpecialization,
    DateTimeOffset Date,
    string Status,
    long? Amount);
