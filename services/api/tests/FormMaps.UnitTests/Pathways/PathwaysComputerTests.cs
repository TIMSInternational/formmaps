using FormMaps.Application.Pathways;

namespace FormMaps.UnitTests.Pathways;

/// <summary>
/// Pure parity for <see cref="PathwaysComputer.Compute"/> (schoolCoursesService.ts computePathways). RED-IF-REGRESSED
/// pins: root→leaf chain derivation, redundant-edge pruning (the ALG1→PRECALC sub-chain is NOT emitted alongside
/// ALG1→ALG2→PRECALC), cycle-safety, chains &lt; 2 dropped, department grouping by the FIRST course + department/chain
/// localeCompare sort, dedup by joined code key, and the MAX_CHAIN_LEN (12) / MAX_CHAINS (200) truncation caps.
/// </summary>
public class PathwaysComputerTests
{
    private static PathwayCourseRow Course(
        string code, string[] prerequisites, string department = "Dept", bool isHonors = false, string? id = null,
        string? name = null) =>
        new(id ?? code.ToLowerInvariant(), code, name ?? code, department, prerequisites, isHonors);

    [Fact]
    public void Empty_catalog_is_no_truncation_no_groups()
    {
        var result = PathwaysComputer.Compute([]);
        Assert.False(result.Truncated);
        Assert.Empty(result.Groups);
    }

    [Fact]
    public void Linear_chain_is_root_to_leaf()
    {
        // PRECALC ⇐ ALG2 ⇐ ALG1 (prerequisites point back; chain flows ALG1 → ALG2 → PRECALC).
        var result = PathwaysComputer.Compute(
        [
            Course("ALG1", []),
            Course("ALG2", ["ALG1"]),
            Course("PRECALC", ["ALG2"]),
        ]);

        var chain = Assert.Single(Assert.Single(result.Groups).Chains);
        Assert.Equal(["ALG1", "ALG2", "PRECALC"], chain.Select(c => c.Code));
        Assert.False(result.Truncated);
    }

    [Fact]
    public void Redundant_direct_edge_is_pruned()
    {
        // PRECALC lists BOTH ALG1 and ALG2, but ALG2 already requires ALG1 → the direct ALG1→PRECALC edge is redundant.
        // Only the full chain is emitted, never the misleading sub-chain ALG1→PRECALC.
        var result = PathwaysComputer.Compute(
        [
            Course("ALG1", []),
            Course("ALG2", ["ALG1"]),
            Course("PRECALC", ["ALG1", "ALG2"]),
        ]);

        var chain = Assert.Single(Assert.Single(result.Groups).Chains);
        Assert.Equal(["ALG1", "ALG2", "PRECALC"], chain.Select(c => c.Code));
    }

    [Fact]
    public void Two_mutual_prereqs_is_cycle_safe_and_rootless()
    {
        // A ⇄ B: both have a prereq → neither is a root → no chains, no infinite loop.
        var result = PathwaysComputer.Compute(
        [
            Course("A", ["B"]),
            Course("B", ["A"]),
        ]);

        Assert.Empty(result.Groups);
        Assert.False(result.Truncated);
    }

    [Fact]
    public void Non_catalog_and_empty_prereqs_are_dropped()
    {
        // B requires GHOST (not in catalog) + "" (empty) + A. Only A is an in-catalog edge → A→B chain; GHOST never
        // appears (it is not a node). B has an in-catalog prereq (A) so B is not itself a root.
        var result = PathwaysComputer.Compute(
        [
            Course("A", []),
            Course("B", ["GHOST", "  ", "A"]),
        ]);

        var chain = Assert.Single(Assert.Single(result.Groups).Chains);
        Assert.Equal(["A", "B"], chain.Select(c => c.Code));
    }

    [Fact]
    public void Null_prereq_element_is_dropped_not_thrown()
    {
        // Documented robustness SUPERSET: a null prerequisites element (unreachable via Prisma's non-nullable String[])
        // is treated as "" and dropped, rather than throwing like legacy JS `null.trim()`. Only the real edge (A) counts.
        var result = PathwaysComputer.Compute(
        [
            Course("A", []),
            new PathwayCourseRow("id-b", "B", "B", "Dept", ["GHOST", null!, "A"], false),
        ]);

        var chain = Assert.Single(Assert.Single(result.Groups).Chains);
        Assert.Equal(["A", "B"], chain.Select(c => c.Code));
    }

    [Fact]
    public void Groups_and_chains_are_localecompare_sorted()
    {
        // Two independent chains rooted in different departments. Groups ordered Math < Science; the node payload
        // carries the first course's department verbatim.
        var result = PathwaysComputer.Compute(
        [
            Course("BIO1", [], department: "Science"),
            Course("BIO2", ["BIO1"], department: "Science"),
            Course("ALG1", [], department: "Mathematics"),
            Course("ALG2", ["ALG1"], department: "Mathematics"),
        ]);

        Assert.Equal(["Mathematics", "Science"], result.Groups.Select(g => g.Department));
        Assert.Equal(["ALG1", "ALG2"], result.Groups[0].Chains.Single().Select(c => c.Code));
        Assert.Equal(["BIO1", "BIO2"], result.Groups[1].Chains.Single().Select(c => c.Code));
    }

    [Fact]
    public void Chains_within_a_department_sort_by_code_key()
    {
        // One root (CORE) fans to two leaves in the same department → two chains "CORE|ADV" and "CORE|BASIC", sorted
        // ADV before BASIC by chain-key localeCompare.
        var result = PathwaysComputer.Compute(
        [
            Course("CORE", []),
            Course("BASIC", ["CORE"]),
            Course("ADV", ["CORE"]),
        ]);

        var chains = Assert.Single(result.Groups).Chains;
        Assert.Equal(["CORE", "ADV"], chains[0].Select(c => c.Code));
        Assert.Equal(["CORE", "BASIC"], chains[1].Select(c => c.Code));
    }

    [Fact]
    public void Node_payload_carries_id_name_ishonors()
    {
        var result = PathwaysComputer.Compute(
        [
            Course("A", [], id: "id-a", name: "Algebra", isHonors: false),
            Course("B", ["A"], id: "id-b", name: "Honors B", isHonors: true),
        ]);

        var chain = Assert.Single(Assert.Single(result.Groups).Chains);
        Assert.Equal(new[] { ("id-a", "Algebra", false), ("id-b", "Honors B", true) },
            chain.Select(n => (n.CourseId, n.Name, n.IsHonors)));
    }

    [Fact]
    public void Depth_cap_truncates_a_long_chain_at_twelve()
    {
        // A 13-deep linear chain C1 ⇐ ... ⇐ C13. path.length+1 >= 12 fires at the 12th node → chain capped at 12,
        // truncated=true.
        var courses = new List<PathwayCourseRow> { Course("C1", []) };
        for (var i = 2; i <= 13; i++)
        {
            courses.Add(Course($"C{i}", [$"C{i - 1}"]));
        }

        var result = PathwaysComputer.Compute(courses);

        var chain = Assert.Single(Assert.Single(result.Groups).Chains);
        Assert.Equal(12, chain.Count);
        Assert.Equal("C1", chain[0].Code);
        Assert.Equal("C12", chain[^1].Code);
        Assert.True(result.Truncated);
    }

    [Fact]
    public void Chain_count_cap_truncates_at_two_hundred()
    {
        // Root R fans to 201 leaves → 201 length-2 chains, but the 200-chain cap stops emission → truncated=true.
        var courses = new List<PathwayCourseRow> { Course("R", []) };
        for (var i = 1; i <= 201; i++)
        {
            courses.Add(Course($"L{i:D3}", ["R"]));
        }

        var result = PathwaysComputer.Compute(courses);

        var total = result.Groups.Sum(g => g.Chains.Count);
        Assert.Equal(200, total);
        Assert.True(result.Truncated);
    }
}
