using System.Text.Json;

namespace FormMaps.Application.CareerFit;

// FM-CF-004. Reads a careerfit-rules.v<version>.json (snake_case as written by tools/careerfit/
// build_rules.py) into CareerFitRules. Hand-walked with JsonDocument rather than bound with the
// serializer so (1) every object the engine iterates keeps the file's declared order, (2) unknown
// members — the provenance blocks, source_text, subfamilies, prose notes — are ignored instead of
// breaking the load, and (3) a missing block the engine needs fails HERE with the JSON path in the
// message, not later inside a formula. LoadEmbedded reads the copy linked into this assembly from
// CareerFit/Data (one source of truth; see FormMaps.Application.csproj). This is not the
// ConfigCache (FM-CF-003): nothing is cached, versioned or validated against the resolver here.

/// <summary>Loader for the versioned CareerFit rule set.</summary>
public static class CareerFitRulesJson
{
    private const string ResourcePrefix = "careerfit-rules.v";
    private const string ResourceSuffix = ".json";

    /// <summary>Parses a rule-set document from a stream. Unknown members are ignored; a missing engine block throws.</summary>
    public static CareerFitRules Load(Stream json)
    {
        using var doc = JsonDocument.Parse(json);
        return Parse(doc.RootElement);
    }

    /// <summary>Loads the rule set of this version embedded in FormMaps.Application (e.g. "1.0.0-draft.1").</summary>
    public static CareerFitRules LoadEmbedded(string version)
    {
        var assembly = typeof(CareerFitRulesJson).Assembly;
        var wanted = ResourcePrefix + version + ResourceSuffix;
        var resourceName = assembly.GetManifestResourceNames()
            .SingleOrDefault(name => name.EndsWith("." + wanted, StringComparison.Ordinal))
            ?? throw new InvalidOperationException(
                $"CareerFit rule set version '{version}' is not embedded; available: {string.Join(", ", EmbeddedVersions())}");
        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Embedded resource {resourceName} could not be opened.");
        return Load(stream);
    }

    /// <summary>The rule-set versions embedded in this assembly, in manifest order.</summary>
    public static IReadOnlyList<string> EmbeddedVersions() =>
        typeof(CareerFitRulesJson).Assembly.GetManifestResourceNames()
            .Select(ExtractVersion)
            .Where(v => v is not null)
            .Select(v => v!)
            .ToList();

    private static string? ExtractVersion(string resourceName)
    {
        var start = resourceName.IndexOf(ResourcePrefix, StringComparison.Ordinal);
        if (start < 0 || !resourceName.EndsWith(ResourceSuffix, StringComparison.Ordinal))
        {
            return null;
        }

        var from = start + ResourcePrefix.Length;
        return resourceName[from..^ResourceSuffix.Length];
    }

    // ---------------------------------------------------------------- document

    private static CareerFitRules Parse(JsonElement root)
    {
        var pca = Required(root, "pca", "$");
        return new CareerFitRules(
            FormatVersion: Int(root, "format_version", "$"),
            RulesVersion: Str(root, "rules_version", "$"),
            Status: Str(root, "status", "$"),
            ModelVersionBasis: OptStr(root, "model_version_basis"),
            Weights: ParseWeights(Required(root, "weights", "$")),
            Thresholds: ParseThresholds(Required(root, "thresholds", "$")),
            Archetypes: ParseArchetypes(Required(pca, "archetypes", "$.pca")),
            Competencies: Required(root, "competencies", "$").EnumerateArray()
                .Select(c => new CompetencyDefinition(Int(c, "competency_id", "$.competencies[]"), Str(c, "name", "$.competencies[]")))
                .ToList(),
            V360Variables: Required(root, "v360_variables", "$").EnumerateArray()
                .Select(v => new V360Variable(Str(v, "code", "$.v360_variables[]"), Dbl(v, "base_weight", "$.v360_variables[]")))
                .ToList(),
            Families: Required(root, "families", "$").EnumerateArray().Select(ParseFamily).ToList());
    }

    private static CareerFitWeights ParseWeights(JsonElement w)
    {
        var careerFit = Required(w, "career_fit", "$.weights");
        var pcaInternal = Required(w, "pca_internal", "$.weights");
        return new CareerFitWeights(
            CareerFit: new CareerFitBlendWeights(
                Mil: Dbl(careerFit, "MIL", "$.weights.career_fit"),
                Pca: Dbl(careerFit, "PCA", "$.weights.career_fit"),
                Personality: Dbl(careerFit, "PERSONALITY", "$.weights.career_fit"),
                Vocational360: Dbl(careerFit, "VOCATIONAL_360", "$.weights.career_fit")),
            PcaInternal: new PcaInternalWeights(
                Disc: Dbl(pcaInternal, "DISC", "$.weights.pca_internal"),
                Competencies: Dbl(pcaInternal, "COMPETENCIES", "$.weights.pca_internal")),
            V360Sources: NumberMap(w, "v360_sources"),
            Relevance: NumberMap(w, "relevance"),
            MilRole: NumberMap(w, "mil_role"),
            CompetencyRole: NumberMap(w, "competency_role"));
    }

    private static CareerFitThresholds ParseThresholds(JsonElement t)
    {
        var convergence = Required(t, "convergence", "$.thresholds");
        var consensus = Required(t, "v360_consensus", "$.thresholds");
        var confidence = Required(t, "v360_confidence", "$.thresholds");

        IReadOnlyDictionary<string, InstrumentThresholds>? perInstrument = null;
        if (convergence.TryGetProperty("per_instrument", out var pi) && pi.ValueKind == JsonValueKind.Object)
        {
            var map = new OrderedDictionary<string, InstrumentThresholds>(StringComparer.Ordinal);
            foreach (var instrument in pi.EnumerateObject())
            {
                var path = "$.thresholds.convergence.per_instrument." + instrument.Name;
                map[instrument.Name] = new InstrumentThresholds(
                    StrongMin: Dbl(instrument.Value, "strong_min", path),
                    PartialMin: Dbl(instrument.Value, "partial_min", path),
                    Provenance: OptStr(instrument.Value, "provenance"));
            }

            perInstrument = map;
        }

        AbsoluteReference? absolute = null;
        if (t.TryGetProperty("absolute_reference", out var ar) && ar.ValueKind == JsonValueKind.Object)
        {
            const string path = "$.thresholds.absolute_reference";
            absolute = new AbsoluteReference(
                Mean: Dbl(ar, "mean", path),
                Sd: Dbl(ar, "sd", path),
                P1: Dbl(ar, "p1", path),
                P5: Dbl(ar, "p5", path),
                P25: Dbl(ar, "p25", path),
                P50: Dbl(ar, "p50", path),
                P75: Dbl(ar, "p75", path),
                P95: Dbl(ar, "p95", path),
                P99: Dbl(ar, "p99", path),
                MatchedMean: OptDbl(ar, "matched_mean"),
                UnmatchedMean: OptDbl(ar, "unmatched_mean"),
                YoudenCut: OptDbl(ar, "youden_cut"),
                Provenance: OptStr(ar, "provenance"));
        }

        return new CareerFitThresholds(
            MilBands: Required(t, "mil_bands", "$.thresholds").EnumerateArray()
                .Select(b => new MilBandRule(Str(b, "name", "$.thresholds.mil_bands[]"), Int(b, "min", "$.thresholds.mil_bands[]"), Int(b, "max", "$.thresholds.mil_bands[]")))
                .ToList(),
            Convergence: new ConvergenceThresholds(
                StrongMin: Dbl(convergence, "strong_min", "$.thresholds.convergence"),
                PartialMin: Dbl(convergence, "partial_min", "$.thresholds.convergence"),
                PerInstrument: perInstrument),
            V360Consensus: new V360ConsensusThresholds(
                HighMin: Dbl(consensus, "high_min", "$.thresholds.v360_consensus"),
                MediumMin: Dbl(consensus, "medium_min", "$.thresholds.v360_consensus")),
            V360Confidence: new V360ConfidenceThresholds(
                ConsensusWeight: Dbl(confidence, "consensus_weight", "$.thresholds.v360_confidence"),
                CoverageWeight: Dbl(confidence, "coverage_weight", "$.thresholds.v360_confidence"),
                HighMin: Dbl(confidence, "high_min", "$.thresholds.v360_confidence"),
                MediumMin: Dbl(confidence, "medium_min", "$.thresholds.v360_confidence")),
            AbsoluteReference: absolute);
    }

    private static IReadOnlyDictionary<string, PcaArchetype> ParseArchetypes(JsonElement archetypes)
    {
        var map = new OrderedDictionary<string, PcaArchetype>(StringComparer.Ordinal);
        foreach (var a in archetypes.EnumerateObject())
        {
            var path = "$.pca.archetypes." + a.Name;
            var factors = new List<PcaFactorRule>(4);
            foreach (var f in Required(a.Value, "factors", path).EnumerateObject())
            {
                factors.Add(new PcaFactorRule(
                    Factor: f.Name,
                    Direction: Str(f.Value, "direction", path + ".factors." + f.Name),
                    Weight: Dbl(f.Value, "weight", path + ".factors." + f.Name),
                    SourceText: OptStr(f.Value, "source_text")));
            }

            var referencedBy = a.Value.TryGetProperty("referenced_by_families", out var rb) && rb.ValueKind == JsonValueKind.Array
                ? rb.EnumerateArray().Select(e => e.GetInt32()).ToList()
                : [];
            map[a.Name] = new PcaArchetype(a.Name, factors, OptStr(a.Value, "vocational_use"), referencedBy);
        }

        return map;
    }

    private static FamilyRules ParseFamily(JsonElement fam)
    {
        var id = Int(fam, "family_id", "$.families[]");
        var path = $"$.families[family_id={id}]";

        var competencyRules = Required(fam, "competency_rules", path).EnumerateArray()
            .Select(r => new CompetencyRule(
                CompetencyId: Int(r, "competency_id", path + ".competency_rules[]"),
                Role: Str(r, "role", path + ".competency_rules[]"),
                MinimumLevel: OptInt(r, "minimum_level"),
                Weight: OptDbl(r, "weight")))
            .ToList();

        var mil = new List<MilSubtestRule>(5);
        foreach (var s in Required(fam, "mil_rules", path).EnumerateObject())
        {
            mil.Add(new MilSubtestRule(
                Subtest: s.Name,
                Role: Str(s.Value, "role", path + ".mil_rules." + s.Name),
                Weight: OptDbl(s.Value, "weight"),
                SourceMarker: OptStr(s.Value, "source_marker"),
                Resolution: OptStr(s.Value, "resolution"),
                SubfamilyCandidate: OptStr(s.Value, "subfamily_candidate")));
        }

        var personalityRoutes = new List<PersonalityRoute>();
        foreach (var r in Required(fam, "personality_routes", path).EnumerateArray())
        {
            var routeId = Str(r, "route_id", path + ".personality_routes[]");
            var dims = new List<PersonalityDimensionRule>();
            foreach (var d in Required(r, "dimensions", path + ".personality_routes[" + routeId + "]").EnumerateObject())
            {
                dims.Add(new PersonalityDimensionRule(
                    Dimension: d.Name,
                    RuleType: OptStr(d.Value, "rule_type"),
                    PreferredPole: OptStr(d.Value, "preferred_pole"),
                    Weight: OptDbl(d.Value, "weight")));
            }

            personalityRoutes.Add(new PersonalityRoute(routeId, dims));
        }

        var v360 = new List<V360Rule>();
        foreach (var v in Required(fam, "v360_rules", path).EnumerateObject())
        {
            v360.Add(new V360Rule(
                Code: v.Name,
                UseMode: OptStr(v.Value, "use_mode"),
                Relevance: OptDbl(v.Value, "relevance") ?? 0.0,
                BaseWeight: Dbl(v.Value, "base_weight", path + ".v360_rules." + v.Name)));
        }

        return new FamilyRules(
            FamilyId: id,
            FamilyName: Str(fam, "family_name", path),
            Scorable: Required(fam, "scorable", path).GetBoolean(),
            InheritOccupation: fam.TryGetProperty("inherit_occupation", out var inherit) && inherit.ValueKind == JsonValueKind.True,
            PcaRoutes: Required(fam, "pca_routes", path).EnumerateArray().Select(e => e.GetString()!).ToList(),
            CompetencyRules: competencyRules,
            MilRules: new MilRules(mil),
            PersonalityRoutes: personalityRoutes,
            V360Rules: v360);
    }

    // ---------------------------------------------------------------- element helpers

    private static JsonElement Required(JsonElement parent, string name, string path)
    {
        if (!parent.TryGetProperty(name, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            throw new InvalidOperationException($"CareerFit rule set: required member '{name}' missing at {path}");
        }

        return value;
    }

    private static string Str(JsonElement parent, string name, string path) =>
        Required(parent, name, path).GetString()
        ?? throw new InvalidOperationException($"CareerFit rule set: '{name}' at {path} is not a string");

    private static int Int(JsonElement parent, string name, string path) => Required(parent, name, path).GetInt32();

    private static double Dbl(JsonElement parent, string name, string path) => Required(parent, name, path).GetDouble();

    private static string? OptStr(JsonElement parent, string name) =>
        parent.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static int? OptInt(JsonElement parent, string name) =>
        parent.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : null;

    private static double? OptDbl(JsonElement parent, string name) =>
        parent.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;

    // A string -> number block (v360_sources, relevance, mil_role, competency_role). Non-numeric members
    // (the model config's "status": "PROVISIONAL", "DIFFERENTIATOR": "report_only") are skipped, not errors.
    private static IReadOnlyDictionary<string, double> NumberMap(JsonElement parent, string name)
    {
        var map = new OrderedDictionary<string, double>(StringComparer.Ordinal);
        if (parent.TryGetProperty(name, out var block) && block.ValueKind == JsonValueKind.Object)
        {
            foreach (var member in block.EnumerateObject())
            {
                if (member.Value.ValueKind == JsonValueKind.Number)
                {
                    map[member.Name] = member.Value.GetDouble();
                }
            }
        }

        return map;
    }
}
