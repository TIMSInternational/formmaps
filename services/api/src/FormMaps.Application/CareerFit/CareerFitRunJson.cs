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

    /// <summary>
    /// The non-scalar half of evaluate_owner's return dict — the four blocks the schema names — plus
    /// FM-CF-010's <c>formula_steps</c>: one record per F01–F23 application the family's evaluation actually
    /// executed, in execution order (<see cref="CareerFitAuditLedger"/>). The four reference blocks say what
    /// the instruments produced; the ledger says how, step by step, and is what makes the acceptance's
    /// "audit row count == formula steps per family per student" a countable thing.
    /// </summary>
    public sealed record FamilyResultAudit(
        AuditInputs AuditInputs,
        ConvergenceResult ConvergenceDetail,
        IReadOnlyList<CriticalGap> CriticalGaps,
        IReadOnlyDictionary<string, double> MilRelativeStrengths,
        IReadOnlyList<FormulaStep> FormulaSteps);

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

            // FM-CF-007's per-VARIABLE trail and FM-CF-010's F01-F05 step ledger. Both belong to the RUN,
            // not to a family: the aggregate map is global, built once from the student's responses before
            // any family is scored. Both are empty when v360_source is NO_DATA -- nothing executed.
            writer.WriteStartArray("v360_variables");
            foreach (var variable in quality.V360Variables)
            {
                WriteV360Variable(writer, variable);
            }

            writer.WriteEndArray();

            if (quality.V360Instrument is { } instrument)
            {
                writer.WritePropertyName("v360_instrument");
                WriteV360Variable(writer, instrument);
            }
            else
            {
                writer.WriteNull("v360_instrument");
            }

            writer.WritePropertyName("v360_formula_steps");
            JsonSerializer.Serialize(writer, quality.V360FormulaSteps, AuditOptions);

            writer.WriteStartObject("sources");
            writer.WriteString("pca_result_id", sources.PcaResultId);
            writer.WriteString("lia_session_id", sources.LiaSessionId);
            writer.WriteString("personality_session_id", sources.PersonalitySessionId);
            writer.WriteEndObject();

            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>One <see cref="V360VariableAudit"/> as the run's inputQuality stores it. Written by hand so the rater-source keys keep the rule set's own spelling.</summary>
    private static void WriteV360Variable(Utf8JsonWriter writer, V360VariableAudit variable)
    {
        writer.WriteStartObject();
        writer.WriteString("code", variable.Code);
        WriteNullableNumber(writer, "score", variable.Score);
        WriteNullableNumber(writer, "consensus", variable.Consensus);
        WriteNullableNumber(writer, "confidence_index", variable.ConfidenceIndex);
        writer.WriteNumber("source_coverage", variable.SourceCoverage);
        writer.WriteNumber("valid_sources", variable.ValidSources);
        writer.WriteNumber("items_answered", variable.ItemsAnswered);
        writer.WriteNumber("items_expected", variable.ItemsExpected);

        writer.WriteStartArray("sources");
        foreach (var source in variable.Sources)
        {
            writer.WriteStringValue(source);
        }

        writer.WriteEndArray();

        writer.WriteStartObject("source_scores");
        foreach (var (source, score) in variable.SourceScores)
        {
            writer.WriteNumber(source, score);
        }

        writer.WriteEndObject();
        writer.WriteEndObject();
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

    /// <summary>careerfit_family_results."audit" for one family: audit_inputs / convergence_detail / critical_gaps / mil_relative_strengths / formula_steps.</summary>
    public static string SerializeFamilyAudit(OwnerEvaluation evaluation)
    {
        ArgumentNullException.ThrowIfNull(evaluation);
        var audit = new FamilyResultAudit(
            evaluation.AuditInputs,
            evaluation.ConvergenceDetail,
            evaluation.CriticalGaps,
            evaluation.MilRelativeStrengths,
            evaluation.AuditSteps);
        return JsonSerializer.Serialize(audit, AuditOptions);
    }

    // ------------------------------------------------- reading a persisted run back (FM-CF-012)

    /// <summary>
    /// The inverse of <see cref="SerializeInputQuality"/>: a stored inputQuality document back into the
    /// adapter record and the source row ids. FM-CF-012's read endpoints need it because
    /// <c>CareerFitExplanation.From</c> projects a whole <see cref="CareerFitRun"/>, and a run read back out
    /// of the database must carry the SAME quality record the evaluation produced — the 360 source above
    /// all, since that one string is what decides whether the payload says "no evidence was gathered" or
    /// "the evidence is weak", and those must never render the same way.
    ///
    /// <see cref="InputQuality.HasRepairs"/> is deliberately NOT read from the document: it is a derived
    /// property over the warnings, so re-deriving it here keeps one definition of "was anything repaired"
    /// rather than trusting a value some earlier writer may have computed differently.
    /// </summary>
    public static (InputQuality Quality, CareerFitInputSources Sources) ParseInputQuality(JsonElement quality)
    {
        if (quality.ValueKind != JsonValueKind.Object)
        {
            throw new ArgumentException("A CareerFit inputQuality document must be a JSON object.", nameof(quality));
        }

        var derivation = new Dictionary<string, PersonalityPoleDerivation>(StringComparer.Ordinal);
        if (quality.TryGetProperty("personality_derivation", out var derivations) && derivations.ValueKind == JsonValueKind.Object)
        {
            foreach (var entry in derivations.EnumerateObject())
            {
                derivation[entry.Name] = ParseDerivation(entry.Value.GetString()!);
            }
        }

        var warnings = new List<InputWarning>();
        foreach (var warning in ArrayOf(quality, "warnings"))
        {
            warnings.Add(new InputWarning(
                warning.GetProperty("instrument").GetString()!,
                warning.GetProperty("code").GetString()!,
                warning.GetProperty("message").GetString()!));
        }

        var parsed = new InputQuality(
            DiscGraph: (DiscGraphChoice)quality.GetProperty("disc_graph").GetInt32(),
            UnknownCompetencyNames: [.. ArrayOf(quality, "unknown_competency_names").Select(e => e.GetString()!)],
            DefaultedCompetencyIds: [.. ArrayOf(quality, "defaulted_competency_ids").Select(e => e.GetInt32())],
            PersonalityDerivation: derivation,
            V360Source: quality.GetProperty("v360_source").GetString()!,
            Warnings: warnings)
        {
            V360Variables = [.. ArrayOf(quality, "v360_variables").Select(ParseV360Variable)],
            V360Instrument = quality.TryGetProperty("v360_instrument", out var instrument) && instrument.ValueKind == JsonValueKind.Object
                ? ParseV360Variable(instrument)
                : null,
            V360FormulaSteps = quality.TryGetProperty("v360_formula_steps", out var steps) && steps.ValueKind == JsonValueKind.Array
                ? steps.Deserialize<List<FormulaStep>>(AuditOptions) ?? []
                : [],
        };

        var sources = quality.GetProperty("sources");
        return (parsed, new CareerFitInputSources(
            sources.GetProperty("pca_result_id").GetString()!,
            sources.GetProperty("lia_session_id").GetString()!,
            sources.GetProperty("personality_session_id").GetString()!));
    }

    /// <summary>
    /// The inverse of <see cref="SerializeFamilyAudit"/>. One <c>Deserialize</c> call and no hand-written
    /// mapping on purpose: the FM-CF-004 result records were named after the reference engine's keys
    /// precisely so this direction is mechanical, and every engine enum carries its own
    /// <c>JsonStringEnumConverter</c> with the reference's spelling (<see cref="CareerFitEnums"/>), so the
    /// round trip is symmetric by construction rather than by a second transcription that can drift.
    /// </summary>
    public static FamilyResultAudit ParseFamilyAudit(JsonElement audit)
    {
        if (audit.ValueKind != JsonValueKind.Object)
        {
            throw new ArgumentException("A CareerFit family audit document must be a JSON object.", nameof(audit));
        }

        return audit.Deserialize<FamilyResultAudit>(AuditOptions)
            ?? throw new ArgumentException("A CareerFit family audit document must be a JSON object.", nameof(audit));
    }

    /// <summary>One <see cref="V360VariableAudit"/> back out of the run's inputQuality (the inverse of <see cref="WriteV360Variable"/>).</summary>
    private static V360VariableAudit ParseV360Variable(JsonElement element) => new(
        Code: element.GetProperty("code").GetString()!,
        Score: ReadNullableNumber(element, "score"),
        Consensus: ReadNullableNumber(element, "consensus"),
        ConfidenceIndex: ReadNullableNumber(element, "confidence_index"),
        SourceCoverage: element.GetProperty("source_coverage").GetDouble(),
        ValidSources: element.GetProperty("valid_sources").GetInt32(),
        ItemsAnswered: element.GetProperty("items_answered").GetInt32(),
        ItemsExpected: element.GetProperty("items_expected").GetInt32(),
        Sources: [.. element.GetProperty("sources").EnumerateArray().Select(e => e.GetString()!)])
    {
        SourceScores = element.TryGetProperty("source_scores", out var scores) && scores.ValueKind == JsonValueKind.Object
            ? scores.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetDouble(), StringComparer.Ordinal)
            : new Dictionary<string, double>(StringComparer.Ordinal),
    };

    /// <summary>The inverse of <see cref="DerivationCode"/>; an unrecognised code throws rather than defaulting to a derivation the run did not use.</summary>
    private static PersonalityPoleDerivation ParseDerivation(string code) => code switch
    {
        "COUNTS" => PersonalityPoleDerivation.Counts,
        "INTENSITY" => PersonalityPoleDerivation.Intensity,
        "UNANSWERED" => PersonalityPoleDerivation.Unanswered,
        _ => throw new ArgumentOutOfRangeException(nameof(code), code, "Unknown personality pole derivation code"),
    };

    /// <summary>An array property, or nothing when it is absent or null — a document written before a field existed reads as empty, never as a crash.</summary>
    private static IEnumerable<JsonElement> ArrayOf(JsonElement element, string name) =>
        element.TryGetProperty(name, out var array) && array.ValueKind == JsonValueKind.Array
            ? array.EnumerateArray()
            : [];

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
