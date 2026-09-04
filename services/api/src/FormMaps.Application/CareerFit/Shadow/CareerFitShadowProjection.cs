using System.Reflection;
using System.Text.Json;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.Application.CareerFit.Shadow;

// FM-CF-013. The legacy cluster -> CareerFit family projection: the comparison's premise.
//
// THE TWO ENGINES DO NOT SCORE THE SAME UNIT. Legacy /careers/score ranks ~370 individual programs,
// each tagged with a cluster; the .NET engine ranks 14 career FAMILIES and has no catalogue at all
// (careerfit-schema.sql: "no per-career / per-subfamily rows"). "Rank correlation" between the two
// therefore does not exist until something says which legacy cluster belongs to which family. That
// something is Data/careerfit-shadow-projection.v0.json, and it is a first-class versioned artefact
// rather than a dictionary literal in this file, for the same reason the rule set is: it is a
// judgement about careers, TIMS has to be able to overrule it cell by cell, and every row this slice
// writes records which version of it produced the numbers.
//
// IT IS INCOMPLETE, AND THAT IS THE HONEST STATE. The legacy cluster vocabulary is not in this
// repository (the catalogue and GET /careers/clusters are formmaps-platform's), so the shipped file
// carries exactly one evidenced entry and the status INCOMPLETE_PENDING_LEGACY_CLUSTER_VOCABULARY.
// This class therefore FAILS CLOSED: an unmapped cluster is recorded by name, never guessed at, and a
// pair whose legacy evidence reaches fewer than MinimumFamiliesForComparison families is marked NOT
// COMPARABLE with cause TAXONOMY_UNMAPPED rather than silently correlated over whatever did map.
// Running the job today against real students is expected to yield a cohort of incomparable rows and
// a report that says so; that is the correct output for a projection nobody has filled in yet, and it
// is a far better outcome than a plausible-looking rho computed through an invented taxonomy.
//
// Deliberately NOT here: any inference from a program TITLE (a Spanish/English title match is a
// second, worse taxonomy), any fallback that maps an unknown cluster to a "nearest" family, and any
// score arithmetic — this class answers "which family, if any" and nothing else.

/// <summary>One legacy cluster's assignment, with the evidence that produced it.</summary>
/// <param name="Cluster">The cluster label exactly as the projection file spells it.</param>
/// <param name="FamilyId">The CareerFit family, or null where the cluster deliberately belongs to none.</param>
/// <param name="Evidence">Why this assignment was made — carried so a report can quote it beside a disagreement.</param>
public sealed record ClusterAssignment(string Cluster, int? FamilyId, string Evidence);

/// <summary>The legacy cluster → CareerFit family projection, loaded from the embedded versioned file.</summary>
public sealed class CareerFitShadowProjection
{
    /// <summary>Status of the shipped file: the vocabulary it needs is not in this repository.</summary>
    public const string IncompleteStatus = "INCOMPLETE_PENDING_LEGACY_CLUSTER_VOCABULARY";

    /// <summary>Basename of the embedded projection this build ships.</summary>
    public const string EmbeddedFileName = "careerfit-shadow-projection.v0.json";

    private static readonly Lazy<CareerFitShadowProjection> EmbeddedProjection =
        new(() => Parse(LoadEmbeddedJson(EmbeddedFileName)), LazyThreadSafetyMode.ExecutionAndPublication);

    private readonly IReadOnlyDictionary<string, ClusterAssignment> _byNormalisedCluster;

    private CareerFitShadowProjection(
        string version,
        string status,
        int minimumFamiliesForComparison,
        IReadOnlyDictionary<string, ClusterAssignment> byNormalisedCluster,
        IReadOnlyDictionary<int, string> familyNames)
    {
        Version = version;
        Status = status;
        MinimumFamiliesForComparison = minimumFamiliesForComparison;
        _byNormalisedCluster = byNormalisedCluster;
        FamilyNames = familyNames;
    }

    /// <summary>The version string every shadow row records (<c>projectionVersion</c>).</summary>
    public string Version { get; }

    /// <summary>The file's own status. <see cref="IncompleteStatus"/> while the legacy vocabulary is unknown.</summary>
    public string Status { get; }

    /// <summary>True while the projection has not been completed from a real legacy cluster vocabulary.</summary>
    public bool IsIncomplete => string.Equals(Status, IncompleteStatus, StringComparison.Ordinal);

    /// <summary>How many families legacy evidence must reach before a pair may be called comparable.</summary>
    public int MinimumFamiliesForComparison { get; }

    /// <summary>Family id → name, for report readability only; never used to join anything.</summary>
    public IReadOnlyDictionary<int, string> FamilyNames { get; }

    /// <summary>Every assignment the file declares, for the report's provenance block.</summary>
    public IReadOnlyCollection<ClusterAssignment> Assignments => (IReadOnlyCollection<ClusterAssignment>)_byNormalisedCluster.Values;

    /// <summary>The projection this build embeds. Parsed once per process; a failed parse stays failed.</summary>
    public static CareerFitShadowProjection Embedded => EmbeddedProjection.Value;

    /// <summary>
    /// The family this cluster projects onto, or null when the projection does not assign one — whether
    /// because the cluster is absent from the file (unknown vocabulary) or because the file assigns it
    /// null on purpose (a legacy cluster V1 CareerFit does not model). The caller distinguishes the two
    /// through <see cref="Declares"/>; the comparator treats both as "no family", because in both cases
    /// no legacy evidence reaches a family.
    /// </summary>
    public int? Map(string cluster) =>
        _byNormalisedCluster.TryGetValue(Normalize(cluster), out var assignment) ? assignment.FamilyId : null;

    /// <summary>True when the file mentions this cluster at all (with or without a family).</summary>
    public bool Declares(string cluster) => _byNormalisedCluster.ContainsKey(Normalize(cluster));

    /// <summary>
    /// Cluster keys are matched through <see cref="CompetencyAdapter.NormalizeName"/> — the SAME
    /// normaliser FM-CF-005 uses to join competency names (NFD, marks stripped, case-folded,
    /// punctuation collapsed). One normaliser, not two: the failure it exists to prevent (a printed
    /// label that differs from the catalogue's only by accent, case or a separator) is identical here,
    /// and "Social_and_Behavioral_Sciences" / "Social and Behavioral Sciences" must not be two clusters.
    /// </summary>
    public static string Normalize(string cluster) => CompetencyAdapter.NormalizeName(cluster ?? string.Empty);

    /// <summary>Parses a projection document. Public so tests can build a COMPLETE synthetic projection without touching the shipped file.</summary>
    public static CareerFitShadowProjection Parse(string json)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(json);
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        var version = root.GetProperty("projection_version").GetString()
            ?? throw new InvalidOperationException("The projection document carries no projection_version.");
        var status = root.GetProperty("status").GetString()
            ?? throw new InvalidOperationException("The projection document carries no status.");
        var minimum = root.TryGetProperty("minimum_families_for_comparison", out var min) ? min.GetInt32() : 3;
        if (minimum < 1)
        {
            throw new InvalidOperationException(
                $"minimum_families_for_comparison must be at least 1; the document says {minimum}.");
        }

        var clusters = new Dictionary<string, ClusterAssignment>(StringComparer.Ordinal);
        foreach (var entry in root.GetProperty("clusters").EnumerateObject())
        {
            var key = Normalize(entry.Name);
            var familyId = entry.Value.TryGetProperty("family_id", out var id) && id.ValueKind == JsonValueKind.Number
                ? id.GetInt32()
                : (int?)null;
            var evidence = entry.Value.TryGetProperty("evidence", out var why) ? why.GetString() ?? string.Empty : string.Empty;

            if (!clusters.TryAdd(key, new ClusterAssignment(entry.Name, familyId, evidence)))
            {
                // Two spellings of one cluster would make the projection's behaviour depend on JSON member
                // order, which is exactly the class of silent ambiguity the normaliser exists to surface.
                throw new InvalidOperationException(
                    $"The projection declares cluster \"{entry.Name}\" twice under normalised key \"{key}\".");
            }
        }

        var names = new Dictionary<int, string>();
        if (root.TryGetProperty("family_names", out var familyNames))
        {
            foreach (var entry in familyNames.EnumerateObject())
            {
                names[int.Parse(entry.Name, System.Globalization.CultureInfo.InvariantCulture)] =
                    entry.Value.GetString() ?? string.Empty;
            }
        }

        return new CareerFitShadowProjection(version, status, minimum, clusters, names);
    }

    /// <summary>
    /// Asserts the projection's family ids and names still agree with the loaded rule set. Called by the
    /// runner at construction so a rules bump that renamed or removed a family cannot leave a stale name
    /// in a report or an assignment pointing at a family that no longer exists.
    /// </summary>
    public void AssertAgreesWith(CareerFitRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        var byId = rules.Families.ToDictionary(f => f.FamilyId);

        foreach (var assignment in _byNormalisedCluster.Values)
        {
            if (assignment.FamilyId is int familyId && !byId.ContainsKey(familyId))
            {
                throw new InvalidOperationException(
                    $"Projection {Version} assigns cluster \"{assignment.Cluster}\" to family {familyId}, "
                    + $"which rule set {rules.RulesVersion} does not declare.");
            }
        }

        foreach (var (familyId, name) in FamilyNames)
        {
            if (byId.TryGetValue(familyId, out var family)
                && !string.Equals(family.FamilyName, name, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    $"Projection {Version} names family {familyId} \"{name}\" but rule set {rules.RulesVersion} "
                    + $"names it \"{family.FamilyName}\".");
            }
        }
    }

    private static string LoadEmbeddedJson(string fileName)
    {
        var assembly = typeof(CareerFitShadowProjection).GetTypeInfo().Assembly;
        var resource = assembly.GetManifestResourceNames()
            .SingleOrDefault(n => n.EndsWith($".{fileName}", StringComparison.Ordinal))
            ?? throw new InvalidOperationException(
                $"Embedded projection \"{fileName}\" is not in {assembly.GetName().Name}. "
                + "It is linked by FormMaps.Application.csproj from CareerFit/Data.");

        using var stream = assembly.GetManifestResourceStream(resource)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
