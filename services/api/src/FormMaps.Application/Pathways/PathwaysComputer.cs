using System.Globalization;
using FormMaps.Application.Assessments;

namespace FormMaps.Application.Pathways;

/// <summary>
/// Pure port of <c>computePathways</c> (schoolCoursesService.ts ~723-864). Derives course pathways from the
/// prerequisite graph: a "sequence" is a maximal chain in the transitively-reduced prereq DAG. Cycle-safe;
/// redundant direct edges (u→v where u is already a transitive prereq of another prereq of v) are pruned so a
/// sub-chain is not emitted alongside the fuller chain. Grouped by the first course's department, sorted
/// department-then-chain via JS <c>localeCompare</c> (ICU) parity.
///
/// <para>The caller MUST pass <paramref name="courses"/> already ordered by <c>code ASC</c> under the SAME Postgres
/// collation the legacy Prisma query uses — that iteration order is load-bearing (byCode last-wins, forwardEdges push
/// order, root order, DFS order). The final department/chain sort is the ONLY in-app ordering.</para>
/// </summary>
public static class PathwaysComputer
{
    private const int MaxChains = 200;
    private const int MaxChainLen = 12;

    private static readonly IReadOnlyList<string> Empty = [];

    public static PathwaysResult Compute(IReadOnlyList<PathwayCourseRow> courses)
    {
        // Index by UPPER(code). JS `new Map(courses.map(c => [c.code.toUpperCase(), c]))` → LAST-wins on dup upper codes.
        var byCode = new Dictionary<string, PathwayCourseRow>(StringComparer.Ordinal);
        foreach (var c in courses)
        {
            byCode[c.Code.ToUpperInvariant()] = c;
        }

        // In-catalog prereqs per course (trim + upper, drop empty AND non-catalog). Keyed UPPER, LAST-wins. Duplicates
        // in the raw array survive the map/filter and are kept (they feed duplicate forward edges below, faithfully).
        var inCatalogPrereqs = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var c in courses)
        {
            var prereqs = new List<string>();
            foreach (var raw in c.Prerequisites)
            {
                // `raw ?? string.Empty` is an intentional robustness SUPERSET over legacy: a null array element would make
                // JS `.trim()` throw → 500, whereas here it becomes "" and is dropped → 200. UNREACHABLE on real data —
                // Prisma's non-nullable String[] (default []) never persists a null element, and all writes go via Prisma.
                var p = JsString.JsTrim(raw ?? string.Empty).ToUpperInvariant();
                if (p.Length > 0 && byCode.ContainsKey(p))
                {
                    prereqs.Add(p);
                }
            }

            inCatalogPrereqs[c.Code.ToUpperInvariant()] = prereqs;
        }

        // Is `target` a transitive prereq of `from`? Walks prereq edges (cycle-safe). Mirrors the JS stack DFS —
        // reachability is order-independent, so LIFO parity is incidental.
        bool IsTransitivePrereq(string target, string from)
        {
            var stack = new Stack<string>();
            stack.Push(from);
            var seen = new HashSet<string>(StringComparer.Ordinal);
            while (stack.Count > 0)
            {
                var cur = stack.Pop();
                if (!seen.Add(cur))
                {
                    continue;
                }

                foreach (var p in Prereqs(inCatalogPrereqs, cur))
                {
                    if (p == target)
                    {
                        return true;
                    }

                    stack.Push(p);
                }
            }

            return false;
        }

        // Forward adjacency over the transitively-reduced edge set. A direct edge prereqCode→code is redundant when
        // prereqCode is already a transitive prereq of ANOTHER prereq of code — dropping it avoids emitting the
        // misleading sub-chain. Push order (courses order, then prereqs order) is load-bearing for chain order pre-sort.
        var forwardEdges = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var c in courses)
        {
            var code = c.Code.ToUpperInvariant();
            var prereqs = inCatalogPrereqs[code];
            foreach (var prereqCode in prereqs)
            {
                var redundant = prereqs.Any(other => other != prereqCode && IsTransitivePrereq(prereqCode, other));
                if (redundant)
                {
                    continue;
                }

                if (!forwardEdges.TryGetValue(prereqCode, out var list))
                {
                    list = [];
                    forwardEdges[prereqCode] = list;
                }

                list.Add(code);
            }
        }

        // Roots: courses with NO in-catalog prereqs that ARE some course's prerequisite (have ≥1 forward edge).
        var roots = new List<string>();
        foreach (var c in courses)
        {
            var code = c.Code.ToUpperInvariant();
            var hasNoCatalogPrereqs = inCatalogPrereqs[code].Count == 0;
            var hasDependents = Forward(forwardEdges, code).Count > 0;
            if (hasNoCatalogPrereqs && hasDependents)
            {
                roots.Add(code);
            }
        }

        // DFS forward from each root, producing root→leaf chains (chains shorter than 2 are dropped by Emit).
        var allChains = new List<List<PathwayNode>>();
        var truncated = false;

        void Emit(List<string> codes)
        {
            if (codes.Count < 2)
            {
                return;
            }

            var chain = new List<PathwayNode>(codes.Count);
            foreach (var code in codes)
            {
                var c = byCode[code];
                chain.Add(new PathwayNode(c.Id, c.Code, c.Name, c.IsHonors));
            }

            allChains.Add(chain);
        }

        void Dfs(string currentCode, List<string> path, HashSet<string> visited)
        {
            var nexts = Forward(forwardEdges, currentCode).Where(nc => !visited.Contains(nc)).ToList();

            if (nexts.Count == 0)
            {
                Emit([.. path, currentCode]);
                return;
            }

            if (path.Count + 1 >= MaxChainLen)
            {
                Emit([.. path, currentCode]);
                truncated = true; // a longer chain exists but was cut at the depth cap
                return;
            }

            var newVisited = new HashSet<string>(visited, StringComparer.Ordinal) { currentCode };
            foreach (var next in nexts)
            {
                if (allChains.Count >= MaxChains)
                {
                    truncated = true;
                    return;
                }

                Dfs(next, [.. path, currentCode], newVisited);
            }
        }

        foreach (var root in roots)
        {
            if (allChains.Count >= MaxChains)
            {
                truncated = true;
                break;
            }

            Dfs(root, [], new HashSet<string>(StringComparer.Ordinal));
        }

        // Dedup identical chains by joined code key, keeping first occurrence.
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var uniqueChains = new List<List<PathwayNode>>();
        foreach (var chain in allChains)
        {
            if (seen.Add(ChainKey(chain)))
            {
                uniqueChains.Add(chain);
            }
        }

        // Group by the FIRST course's department (verbatim; "General" only if unresolvable), preserving insertion order.
        var byDept = new Dictionary<string, List<IReadOnlyList<PathwayNode>>>(StringComparer.Ordinal);
        var deptOrder = new List<string>();
        foreach (var chain in uniqueChains)
        {
            var dept = byCode.TryGetValue(chain[0].Code.ToUpperInvariant(), out var row) ? row.Department : "General";
            if (!byDept.TryGetValue(dept, out var list))
            {
                list = [];
                byDept[dept] = list;
                deptOrder.Add(dept);
            }

            list.Add(chain);
        }

        // Sort departments alphabetically; within each department sort chains by full code key. Both via JS
        // localeCompare (ICU) parity. OrderBy is a STABLE sort, matching ES2019+ Array.prototype.sort stability.
        var groups = deptOrder
            .OrderBy(dept => dept, LocaleComparer)
            .Select(dept => new PathwayGroup(
                dept,
                byDept[dept].OrderBy(ChainKey, LocaleComparer).ToList()))
            .ToList();

        return new PathwaysResult(truncated, groups);
    }

    private static string ChainKey(IReadOnlyList<PathwayNode> chain) => string.Join("|", chain.Select(c => c.Code));

    private static IReadOnlyList<string> Prereqs(Dictionary<string, List<string>> map, string key) =>
        map.TryGetValue(key, out var v) ? v : Empty;

    private static IReadOnlyList<string> Forward(Dictionary<string, List<string>> map, string key) =>
        map.TryGetValue(key, out var v) ? v : Empty;

    // JS String.prototype.localeCompare(that) parity. Node resolves the default locale (en-US on the prod container)
    // and compares via ICU; .NET's InvariantCulture CompareInfo is likewise ICU-backed, reproducing the ordering for
    // the realistic inputs here — UPPER-case course codes, title-case department names, and the '|' chain separator
    // (ICU sorts punctuation before digits/letters, unlike an ordinal compare). Locale/case/exotic-punctuation
    // divergences between ICU-root and en-US are a display-only residual, unreachable for well-formed course data.
    // Pinned against Node gold in PathwaysLocaleCompareTests.
    private static readonly IComparer<string> LocaleComparer = Comparer<string>.Create(JsLocaleCompare);

    public static int JsLocaleCompare(string a, string b) =>
        Math.Sign(CultureInfo.InvariantCulture.CompareInfo.Compare(a, b, CompareOptions.None));
}
