using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Serialized vocational score result (legacy serializeVocationalResult). Composite is a JSON NUMBER
/// (Number(Decimal)); dimensionScores/rankings/weightsApplied pass through as stored jsonb (camelCase inner
/// keys). Carries a computed <c>Status</c> = "ready" (the reader returns null for "never_computed").
/// </summary>
public sealed record VocationalScoreRead(
    string EvaluatedUserId,
    string InstrumentVersion,
    double Composite,
    string Band,
    int RespondentCount,
    IReadOnlyList<string> GroupsIncluded,
    JsonElement DimensionScores,
    JsonElement Rankings,
    JsonElement WeightsApplied,
    string ComputedAt)
{
    public string Status => "ready";
}

/// <summary>Serialized vocational integrated result (legacy serializeIntegratedResult) — all four scores as JSON numbers.</summary>
public sealed record VocationalIntegratedRead(
    string EvaluatedUserId,
    string InstrumentVersion,
    double IntegratedComposite,
    string Band,
    double ThreeSixtyScore,
    double PcaScore,
    double MilScore,
    JsonElement WeightsApplied,
    string ComputedAt)
{
    public string Status => "ready";
}

/// <summary>Instrument catalog dimension (legacy InstrumentDimensionDto). weight is a JSON number; scaleAnchors passes through.</summary>
public sealed record InstrumentDimensionDto(
    string Key, string NameEs, string? NameEn, double Weight, JsonElement ScaleAnchors, int Order);

/// <summary>Active instrument catalog (legacy InstrumentDto) — groupWeights/integrationWeights/interpretationBands pass through as jsonb.</summary>
public sealed record InstrumentDto(
    string Version,
    string Name,
    JsonElement GroupWeights,
    JsonElement IntegrationWeights,
    JsonElement InterpretationBands,
    IReadOnlyList<InstrumentDimensionDto> Dimensions);

/// <summary>One rendered questionnaire item for a rater group (legacy QuestionnaireItem).</summary>
public sealed record QuestionnaireItem(
    int Number,
    string Block,
    string Type,
    string? Area,
    string? DimensionKey,
    JsonElement ScaleAnchors,
    JsonElement Options,
    string Text);

/// <summary>
/// Reads the vocational catalog + persisted result tables under the caller's read-only RLS session (legacy
/// vocational360Service.ts). Result reads return null when there is no active instrument or no stored row
/// (the endpoint maps null to <c>{status:"never_computed"}</c>); GetInstrument returns null → 404.
/// </summary>
public interface IVocationalReader
{
    Task<VocationalScoreRead?> GetScoreAsync(RequestContext context, string evaluatedUserId, CancellationToken cancellationToken = default);

    Task<VocationalIntegratedRead?> GetIntegratedAsync(RequestContext context, string evaluatedUserId, CancellationToken cancellationToken = default);

    /// <summary>Legacy getInstrument: the active instrument + its active dimensions (order asc); null when none active.</summary>
    Task<InstrumentDto?> GetInstrumentAsync(RequestContext context, CancellationToken cancellationToken = default);

    /// <summary>Legacy getQuestionnaire: the active questions for a rater group (the group is validated by the caller).</summary>
    Task<IReadOnlyList<QuestionnaireItem>> GetQuestionnaireAsync(RequestContext context, string group, CancellationToken cancellationToken = default);
}
