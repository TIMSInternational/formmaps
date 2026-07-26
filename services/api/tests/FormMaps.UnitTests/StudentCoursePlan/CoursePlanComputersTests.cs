using System.Text.Json;
using FormMaps.Application.StudentCoursePlan;

namespace FormMaps.UnitTests.StudentCoursePlan;

/// <summary>
/// Pure-compute tests for the course-plan.ts recommendations scorer + eligibility map (FM-DOTNET-086).
/// </summary>
public class CoursePlanComputersTests
{
    private static readonly JsonElement EmptyArray = JsonDocument.Parse("[]").RootElement.Clone();

    // ---- recommendations scorer ----

    [Fact]
    public void Scorer_base_50_excludes_enrolled_and_adds_field_and_rating_bonuses()
    {
        var courses = new[]
        {
            Course("c1", title: "Intro to Biology", category: "science", rating: 5),   // +15 (science) +10 (rating) = 75
            Course("c2", title: "History of Art", category: "arts", rating: 3),         // 50
            Course("enrolled", title: "science stuff", rating: 5),                       // excluded
        };
        var result = CoursePlanRecommendationsScorer.Score(
            courses, Set("enrolled"), new[] { "science" }, Array.Empty<string>());

        Assert.Equal(["c1", "c2"], result.Select(x => x.Course.Id)); // sorted desc: 75, 50
        Assert.Equal(75, result[0].MatchScore);
        Assert.Equal(50, result[1].MatchScore);
    }

    [Fact]
    public void Scorer_caps_at_100()
    {
        // 50 + 15*4 (four matching fields) + 10 = 120 → capped 100.
        var course = Course("c1", title: "aaa bbb ccc ddd", category: "aaa", rating: 5);
        var result = CoursePlanRecommendationsScorer.Score(
            new[] { course }, Set(), new[] { "aaa", "bbb", "ccc", "ddd" }, Array.Empty<string>());
        Assert.Equal(100, result.Single().MatchScore);
    }

    [Fact]
    public void Scorer_rating_bonus_is_strictly_greater_than_4()
    {
        var four = CoursePlanRecommendationsScorer.Score(new[] { Course("c", rating: 4) }, Set(), Array.Empty<string>(), Array.Empty<string>());
        var justOver = CoursePlanRecommendationsScorer.Score(new[] { Course("c", rating: 4.01) }, Set(), Array.Empty<string>(), Array.Empty<string>());
        Assert.Equal(50, four.Single().MatchScore);       // rating == 4 → no bonus
        Assert.Equal(60, justOver.Single().MatchScore);   // rating > 4 → +10
    }

    [Fact]
    public void Scorer_field_match_is_over_the_joined_lowercased_text_and_ties_keep_id_order()
    {
        // shortDescription is part of the searched text; two equal scores keep the input (id) order.
        var courses = new[]
        {
            Course("a", shortDescription: "loves MATH"),
            Course("b", title: "Mathletics"),
        };
        var result = CoursePlanRecommendationsScorer.Score(courses, Set(), new[] { "math" }, Array.Empty<string>());
        Assert.Equal(65, result[0].MatchScore); // both matched "math"
        Assert.Equal(65, result[1].MatchScore);
        Assert.Equal(["a", "b"], result.Select(x => x.Course.Id)); // stable on tie
    }

    [Fact]
    public void Scorer_takes_top_10()
    {
        var courses = Enumerable.Range(0, 15).Select(i => Course($"c{i:D2}")).ToArray();
        var result = CoursePlanRecommendationsScorer.Score(courses, Set(), Array.Empty<string>(), Array.Empty<string>());
        Assert.Equal(10, result.Count);
    }

    // ---- Task-6 engine-career-alignment bonus (report §4/§9) ----

    [Fact]
    public void Scorer_engine_career_alignment_adds_10_not_15()
    {
        // Base 50, no preferredFields/rating bonus; careerPaths overlaps an engine career → +10 (NOT +15, that
        // weight belongs to courseService.ts's separate scorer, which has no .NET counterpart).
        var course = Course("c1", careerPaths: new[] { "Software Engineer" });
        var result = CoursePlanRecommendationsScorer.Score(
            new[] { course }, Set(), Array.Empty<string>(), new[] { "software engineer" });
        Assert.Equal(60, result.Single().MatchScore); // 50 + 10
    }

    [Fact]
    public void Scorer_engine_career_alignment_is_case_insensitive_substring_either_direction()
    {
        // Course's careerPath is the SUPERSET string ("Senior Software Engineer") containing the engine career
        // ("software engineer") — and separately the engine career is the superset of a shorter careerPath.
        var courseWithSuperset = Course("superset", careerPaths: new[] { "Senior Software Engineer" });
        var courseIsSuperset = Course("issuperset", careerPaths: new[] { "Engineer" });
        var resultA = CoursePlanRecommendationsScorer.Score(
            new[] { courseWithSuperset }, Set(), Array.Empty<string>(), new[] { "software engineer" });
        var resultB = CoursePlanRecommendationsScorer.Score(
            new[] { courseIsSuperset }, Set(), Array.Empty<string>(), new[] { "senior engineer" });
        Assert.Equal(60, resultA.Single().MatchScore);
        Assert.Equal(60, resultB.Single().MatchScore);
    }

    [Fact]
    public void Scorer_engine_career_alignment_is_a_single_gate_not_accumulated_per_match()
    {
        // Two careerPaths both overlap the (single) engine career — still only +10 once (a boolean .Any() gate,
        // not a per-match loop like the "preferredFields" section).
        var course = Course("c1", careerPaths: new[] { "Software Engineer", "Senior Software Engineer" });
        var result = CoursePlanRecommendationsScorer.Score(
            new[] { course }, Set(), Array.Empty<string>(), new[] { "software engineer" });
        Assert.Equal(60, result.Single().MatchScore);
    }

    [Fact]
    public void Scorer_no_engine_careers_means_no_alignment_bonus_ever()
    {
        var course = Course("c1", careerPaths: new[] { "Software Engineer" });
        var result = CoursePlanRecommendationsScorer.Score(
            new[] { course }, Set(), Array.Empty<string>(), Array.Empty<string>());
        Assert.Equal(50, result.Single().MatchScore); // no engine careers → gate never fires
    }

    [Fact]
    public void Scorer_engine_career_alignment_and_field_and_rating_bonuses_are_additive()
    {
        // +15 (field) +10 (rating) +10 (engine career) = 85.
        var course = Course("c1", title: "science stuff", category: "science", rating: 5, careerPaths: new[] { "Data Scientist" });
        var result = CoursePlanRecommendationsScorer.Score(
            new[] { course }, Set(), new[] { "science" }, new[] { "data scientist" });
        Assert.Equal(85, result.Single().MatchScore);
    }

    // ---- Task-6 engine-career-title extraction (report §4 — the JSON-key-ordering gotcha) ----

    [Fact]
    public void EngineCareerTitleExtractor_object_shape_takes_first_5_keys_in_JSON_document_order_not_alphabetical()
    {
        // 6 keys, deliberately inserted in a NON-alphabetical order — proves document-order extraction, not any
        // resorted/dictionary order. "zzz-last" (6th key) must NOT appear.
        var json = JsonDocument.Parse("""
            {
                "prog-zebra": "insight A",
                "prog-apple": "insight B",
                "prog-mango": "insight C",
                "prog-banana": "insight D",
                "prog-kiwi": "insight E",
                "zzz-last": "insight F"
            }
            """).RootElement;

        var titles = EngineCareerTitleExtractor.Extract(json);

        Assert.Equal(["prog-zebra", "prog-apple", "prog-mango", "prog-banana", "prog-kiwi"], titles);
    }

    [Fact]
    public void EngineCareerTitleExtractor_array_shape_reads_programTitle_off_first_5_entries()
    {
        var json = JsonDocument.Parse("""
            [
                { "programId": "p1", "programTitle": "Data Scientist" },
                { "programId": "p2", "programTitle": "Nurse" },
                { "programId": "p3", "title": "Teacher" },
                { "programId": "p4", "name": "Chef" },
                { "programId": "p5", "programTitle": "Pilot" },
                { "programId": "p6", "programTitle": "Should Be Dropped (6th entry)" }
            ]
            """).RootElement;

        var titles = EngineCareerTitleExtractor.Extract(json);

        Assert.Equal(["Data Scientist", "Nurse", "Teacher", "Chef", "Pilot"], titles);
    }

    [Fact]
    public void EngineCareerTitleExtractor_schema_default_empty_array_is_empty_never_throws()
    {
        Assert.Empty(EngineCareerTitleExtractor.Extract(EmptyArray));
    }

    [Fact]
    public void EngineCareerTitleExtractor_absent_profile_null_input_is_empty_never_throws()
    {
        // No UserCareerProfile row at all → the reader passes a JSON null/undefined element through.
        var nullElement = JsonDocument.Parse("null").RootElement;
        Assert.Empty(EngineCareerTitleExtractor.Extract(nullElement));
    }

    // ---- eligibility map ----

    [Fact]
    public void Eligibility_enumerates_active_status_active_only_but_resolves_over_all()
    {
        var catalog = new[]
        {
            Cat("math1", "MATH1"),
            Cat("math2", "MATH2", prereqs: new[] { "MATH1" }),
            Cat("draft", "DRAFT", status: "draft"),         // resolvable but NOT enumerated
            Cat("inactive", "INACT", isActive: false),      // resolvable but NOT enumerated
        };
        var entries = EligibilityMapComputer.Compute(catalog, Set(), studentGradeLevel: null);
        Assert.Equal(["math1", "math2"], entries.Select(e => e.CourseId)); // only active+status=active enumerated
    }

    [Fact]
    public void Eligibility_grade_error_only_when_gradeLevel_truthy_and_not_included()
    {
        var catalog = new[] { Cat("c", "C", gradeLevels: new[] { 11, 12 }) };
        Assert.False(EligibilityMapComputer.Compute(catalog, Set(), studentGradeLevel: 9).Single().Eligible);   // 9 not allowed
        Assert.True(EligibilityMapComputer.Compute(catalog, Set(), studentGradeLevel: 11).Single().Eligible);   // allowed
        Assert.True(EligibilityMapComputer.Compute(catalog, Set(), studentGradeLevel: null).Single().Eligible); // null → no check
        Assert.True(EligibilityMapComputer.Compute(catalog, Set(), studentGradeLevel: 0).Single().Eligible);    // 0 falsy → no check
    }

    [Fact]
    public void Eligibility_missing_prereq_codes_raw_for_uncataloged_resolved_for_uncompleted()
    {
        var catalog = new[]
        {
            Cat("target", "TGT", prereqs: new[] { "MATH1", "GHOST", "  ", "" }),
            Cat("math1", "MATH1"),
        };
        // MATH1 in catalog but not completed → resolved code "MATH1"; GHOST not in catalog → raw "GHOST"; blanks skipped.
        var target = EligibilityMapComputer.Compute(catalog, Set(), null).Single(e => e.CourseId == "target");
        Assert.False(target.Eligible);
        Assert.Equal(["MATH1", "GHOST"], target.MissingCodes);
    }

    [Fact]
    public void Eligibility_completed_prereq_clears_missing_and_lookup_is_case_insensitive()
    {
        var catalog = new[]
        {
            Cat("target", "TGT", prereqs: new[] { "math1" }), // lowercase prereq ref
            Cat("math1", "MATH1"),
        };
        var target = EligibilityMapComputer.Compute(catalog, Set("math1"), null).Single(e => e.CourseId == "target");
        Assert.True(target.Eligible);
        Assert.Empty(target.MissingCodes);
    }

    // ---- helpers ----

    private static IReadOnlySet<string> Set(params string[] items) => new HashSet<string>(items, StringComparer.Ordinal);

    private static CourseRow Course(
        string id, string title = "", string shortDescription = "", string category = "", double rating = 0,
        string[]? careerPaths = null) => new(
        Id: id, Title: title, ShortDescription: shortDescription, FullDescription: "", Provider: "", Instructor: "",
        Category: category, Subcategory: "", Difficulty: "", Duration: 0, DurationUnit: "weeks", EstimatedHours: 0,
        ThumbnailUrl: "", VideoUrl: "", CourseraUrl: "", ExternalId: "", Rating: rating.ToString(System.Globalization.CultureInfo.InvariantCulture),
        RatingNumber: rating, ReviewCount: 0, EnrollmentCount: 0, Certificate: false, Language: "", Country: "", Region: "",
        Skills: [], MatchingCompetencies: [], CareerPaths: careerPaths ?? [], LearningObjectives: [], Prerequisites: [],
        Syllabus: EmptyArray, RecommendedScore: "0", SourceUrl: "", IsActive: true, CreatedBy: null,
        CreatedDate: "2026-01-01T00:00:00.000Z", UpdatedBy: null, UpdatedAt: "2026-01-01T00:00:00.000Z");

    private static EligibilityMapComputer.CatalogCourse Cat(
        string id, string code, int[]? gradeLevels = null, string[]? prereqs = null, bool isActive = true, string status = "active") =>
        new(id, code, gradeLevels ?? [], prereqs ?? [], isActive, status);
}
