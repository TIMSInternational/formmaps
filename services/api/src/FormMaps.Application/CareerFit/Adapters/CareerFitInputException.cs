namespace FormMaps.Application.CareerFit.Adapters;

/// <summary>
/// FM-CF-005. Thrown by an input adapter when what the platform holds for a student cannot be turned
/// into an engine input WITHOUT guessing — a missing DISC graph, a missing MIL subtest, a personality
/// dimension with neither counts nor an intensity. Every such case is fail-closed on purpose: the
/// engine's formulas would not throw on a substitute (MIL fit over four subtests, a zero DISC factor)
/// — they would silently misweight. Repairable defects (a tail percentile, an over-range level, an
/// unknown competency name) do NOT throw; they are clamped or defaulted and recorded in
/// <see cref="InputQuality"/>. The orchestrator (FM-CF-010) maps this to its "not scorable" outcome.
/// </summary>
public sealed class CareerFitInputException(string instrument, string code, string message)
    : Exception(message)
{
    /// <summary>The instrument the defect belongs to: one of <see cref="InputInstruments"/>.</summary>
    public string Instrument { get; } = instrument;

    /// <summary>A stable machine-readable code (an <see cref="InputWarningCodes"/> value, e.g. MIL_SUBTEST_MISSING).</summary>
    public string Code { get; } = code;
}
