using System.Globalization;
using System.Text;
using System.Text.Json;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.Application.CareerFit;

// FM-CF-010. The three jsonb shapes a run persists (infra/aws/sql/careerfit-schema.sql), produced here
// and nowhere else so a stored row and the engine's in-memory values are one definition apart:
//
//   careerfit_runs."inputs"          the reference engine's evaluate_owner `assessment` dict, key for key
//                                    (pca / competencies / mil / personality / v360_aggregates /
//                                    careerfit360_confidence) — a stored run can be re-scored under any
//                                    later rules version and diffed against the Python engine by name.
//   careerfit_runs."inputQuality"    the FM-CF-005 InputQuality record plus the source row ids and an
//                                    explicit per-instrument evidence map (360 is false until FM-CF-007).
//   careerfit_family_results."audit" the non-scalar half of evaluate_owner's return — audit_inputs,
//                                    convergence_detail, critical_gaps, mil_relative_strengths — under the
//                                    reference's snake_case keys.
//
// Inputs are written and parsed by hand with Utf8JsonWriter / JsonElement because the engine's key names
// are the reference's (upper-case factor letters, numeric competency ids) and must not follow a naming
// policy; the audit is serialised with System.Text.Json under SnakeCaseLower because the FM-CF-004 result
// records were named after the reference's keys precisely so this mapping is mechanical. Numbers are
// written shortest-round-trip, so a parsed input is bit-identical to the double that was scored.
// Deliberately NOT here: any I/O (CareerFitRunWriter), any presentation (FM-CF-011).

/// <summary>Serialisers for the jsonb columns of a CareerFit run.</summary>
public static class CareerFitRunJson
{
    private static readonly JsonSerializerOptions AuditOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DictionaryKeyPolicy = null, // route ids, subtest codes and 360 codes keep their own spelling
    };

    /// <summary>The non-scalar half of evaluate_owner's return dict, exactly the four blocks the schema names.</summary>
    public sealed record FamilyResultAudit(
        AuditInputs AuditInputs,
        ConvergenceResult ConvergenceDetail,
        IReadOnlyList<CriticalGap> CriticalGaps,
        IReadOnlyDictionary<string, double> MilRelativeStrengths);

    // ---------------------------------------------------------------- inputs

    /// <summary>careerfit_runs."inputs": the evaluate_owner assessment dict (pca / competencies / mil / personality / v360_aggregates / careerfit360_confidence).</summary>
    public static string SerializeInputs(CareerFitAssessment assessment)
    {
        ArgumentNullException.ThrowIfNull(assessment);
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();

            writer.WriteStartObject("pca");
            foreach (var factor in CareerFitFormulas.PcaFactors)
            {
                writer.WriteNumber(factor, assessment.Pca.Factor(factor));
            }

            writer.WriteEndObject();

            writer.WriteStartObject("competencies");
            foreach (var id in assessment.Competencies.Keys.OrderBy(id => id))
            {
                writer.WriteNumber(id.ToString(CultureInfo.InvariantCulture), assessment.Competencies[id]);
            }

            writer.WriteEndObject();

            writer.WriteStartObject("mil");
            foreach (var subtest in CareerFitFormulas.MilSubtests)
            {
                writer.WriteNumber(subtest, assessment.Mil.Subtest(subtest));
            }

            writer.WriteEndObject();

            writer.WriteStartObject("personality");
            foreach (var pole in Poles)
            {
                writer.WriteNumber(pole, assessment.Personality.Pole(pole));
            }

            writer.WriteEndObject();

            writer.WriteStartObject("v360_aggregates");
            foreach (var (code, aggregate) in assessment.V360Aggregates)
            {
                writer.WriteStartObject(code);
                writer.WriteNumber("score", aggregate.Score);
                WriteNullableNumber(writer, "consensus", aggregate.Consensus);
                WriteNullableNumber(writer, "confidence_index", aggregate.ConfidenceIndex);
                writer.WriteEndObject();
            }

            writer.WriteEndObject();

            writer.WriteString("careerfit360_confidence", assessment.CareerFit360Confidence.ToReferenceValue());
            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>The inverse of <see cref="SerializeInputs"/>: a stored inputs document back into the engine's assessment (re-scoring under a later version, FM-CF-013 shadow diffs).</summary>
    public static CareerFitAssessment ParseInputs(JsonElement inputs)
    {
        if (inputs.ValueKind != JsonValueKind.Object)
        {
            throw new ArgumentException("A CareerFit inputs document must be a JSON object.", nameof(inputs));
        }

        var pca = inputs.GetProperty("pca");
        var mil = inputs.GetProperty("mil");
        var personality = inputs.GetProperty("personality");

        var competencies = new Dictionary<int, int>();
        foreach (var entry in inputs.GetProperty("competencies").EnumerateObject())
        {
            competencies[int.Parse(entry.Name, CultureInfo.InvariantCulture)] = entry.Value.GetInt32();
        }

        var aggregates = new Dictionary<string, V360Aggregate>(StringComparer.Ordinal);
        if (inputs.TryGetProperty("v360_aggregates", out var v360) && v360.ValueKind == JsonValueKind.Object)
        {
            foreach (var entry in v360.EnumerateObject())
            {
                aggregates[entry.Name] = new V360Aggregate(
                    entry.Value.GetProperty("score").GetDouble(),
                    ReadNullableNumber(entry.Value, "consensus"),
                    ReadNullableNumber(entry.Value, "confidence_index"));
            }
        }

        return new CareerFitAssessment(
            Pca: new PcaInput(
                pca.GetProperty("D").GetDouble(), pca.GetProperty("I").GetDouble(),
                pca.GetProperty("S").GetDouble(), pca.GetProperty("C").GetDouble()),
            Competencies: competencies,
            Mil: new MilInput(
                mil.GetProperty("DC").GetInt32(), mil.GetProperty("RZ").GetInt32(), mil.GetProperty("VN").GetInt32(),
                mil.GetProperty("MT").GetInt32(), mil.GetProperty("OR").GetInt32()),
            Personality: new PersonalityInput(
                personality.GetProperty("E").GetDouble(), personality.GetProperty("I").GetDouble(),
                personality.GetProperty("S").GetDouble(), personality.GetProperty("N").GetDouble(),
                personality.GetProperty("T").GetDouble(), personality.GetProperty("F").GetDouble(),
                personality.GetProperty("J").GetDouble(), personality.GetProperty("P").GetDouble()),
            V360Aggregates: aggregates,
            CareerFit360Confidence: CareerFitEnums.ParseConfidence(inputs.GetProperty("careerfit360_confidence").GetString()!));
    }

    // ---------------------------------------------------------------- input quality

    /// <summary>
    /// careerfit_runs."inputQuality": the InputQuality record (disc_graph, unknown / defaulted competencies,
    /// personality derivation per dimension, v360_source, has_repairs, every warning), the source row ids,
    /// and an explicit evidence map — which of the four convergence instruments actually carried evidence.
    /// In P1–P3 that map is PCA / MIL / PERSONALITY true and 360 false: convergence can count at most three
    /// STRONG instruments, so VERY_HIGH is unreachable and SOLID is the ceiling until FM-CF-006/007.
    /// </summary>
    public static string SerializeInputQuality(InputQuality quality, CareerFitInputSources sources)
    {
        ArgumentNullException.ThrowIfNull(quality);
        ArgumentNullException.ThrowIfNull(sources);
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            writer.WriteNumber("disc_graph", (int)quality.DiscGraph);
            writer.WriteString("disc_graph_name", quality.DiscGraph.ToString());

            writer.WriteStartArray("unknown_competency_names");
            foreach (var name in quality.UnknownCompetencyNames)
            {
                writer.WriteStringValue(name);
            }

            writer.WriteEndArray();

            writer.WriteStartArray("defaulted_competency_ids");
            foreach (var id in quality.DefaultedCompetencyIds)
            {
                writer.WriteNumberValue(id);
            }

            writer.WriteEndArray();

            writer.WriteStartObject("personality_derivation");
            foreach (var (dimension, derivation) in quality.PersonalityDerivation)
            {
                writer.WriteString(dimension, DerivationCode(derivation));
            }

            writer.WriteEndObject();

            writer.WriteString("v360_source", quality.V360Source);
            writer.WriteBoolean("has_repairs", quality.HasRepairs);

            // The three platform instruments are always present when a run exists (the reader fails closed
            // on any of them missing); 360 carries evidence only once an IV360Adapter other than NoData runs.
            var has360 = !string.Equals(quality.V360Source, V360Sources.NoData, StringComparison.Ordinal);
            writer.WriteStartObject("evidence");
            writer.WriteBoolean(InputInstruments.Pca, true);
            writer.WriteBoolean(InputInstruments.Mil, true);
            writer.WriteBoolean(InputInstruments.Personality, true);
            writer.WriteBoolean(InputInstruments.V360, has360);
            writer.WriteEndObject();

            writer.WriteStartArray("warnings");
            foreach (var warning in quality.Warnings)
            {
                writer.WriteStartObject();
                writer.WriteString("instrument", warning.Instrument);
                writer.WriteString("code", warning.Code);
                writer.WriteString("message", warning.Message);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();

            writer.WriteStartObject("sources");
            writer.WriteString("pca_result_id", sources.PcaResultId);
            writer.WriteString("lia_session_id", sources.LiaSessionId);
            writer.WriteString("personality_session_id", sources.PersonalitySessionId);
            writer.WriteEndObject();

            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>Stable persisted spelling of a <see cref="PersonalityPoleDerivation"/>.</summary>
    public static string DerivationCode(PersonalityPoleDerivation derivation) => derivation switch
    {
        PersonalityPoleDerivation.Counts => "COUNTS",
        PersonalityPoleDerivation.Intensity => "INTENSITY",
        PersonalityPoleDerivation.Unanswered => "UNANSWERED",
        _ => throw new ArgumentOutOfRangeException(nameof(derivation), derivation, "Unknown derivation"),
    };

    // ---------------------------------------------------------------- family audit

    /// <summary>careerfit_family_results."audit" for one family: audit_inputs / convergence_detail / critical_gaps / mil_relative_strengths.</summary>
    public static string SerializeFamilyAudit(OwnerEvaluation evaluation)
    {
        ArgumentNullException.ThrowIfNull(evaluation);
        var audit = new FamilyResultAudit(
            evaluation.AuditInputs,
            evaluation.ConvergenceDetail,
            evaluation.CriticalGaps,
            evaluation.MilRelativeStrengths);
        return JsonSerializer.Serialize(audit, AuditOptions);
    }

    // ---------------------------------------------------------------- helpers

    private static readonly IReadOnlyList<string> Poles = ["E", "I", "S", "N", "T", "F", "J", "P"];

    private static void WriteNullableNumber(Utf8JsonWriter writer, string name, double? value)
    {
        if (value is double d)
        {
            writer.WriteNumber(name, d);
        }
        else
        {
            writer.WriteNull(name);
        }
    }

    private static double? ReadNullableNumber(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number ? value.GetDouble() : null;
}
