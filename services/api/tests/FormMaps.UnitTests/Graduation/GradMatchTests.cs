using FormMaps.Application.Graduation;

namespace FormMaps.UnitTests.Graduation;

/// <summary>
/// Port of legacy <c>api/src/__tests__/grad-match.test.ts</c>, case for case, plus the two edges its four cases
/// leave open. This rule decides which graduation category a completed course counts toward, so both
/// /graduation/progress/:studentId and /graduation/gap-analysis/:studentId inherit whatever it says.
/// </summary>
public class GradMatchTests
{
    [Fact]
    public void Matches_strictly_by_required_course_codes_when_a_list_is_set()
    {
        string[] required = ["ENG-9", "ENG-10"];

        Assert.True(GradMatch.CourseMatchesCategory("ENG-9", "English", "English", required));
        // Same department but NOT on the required list -> does not count. This is the arm that makes the rules
        // editor's required-course field actually constrain matching.
        Assert.False(GradMatch.CourseMatchesCategory("ENG-ELECTIVE", "English", "English", required));
    }

    [Fact]
    public void Is_case_insensitive_on_required_codes()
    {
        Assert.True(GradMatch.CourseMatchesCategory("ALG-1", "Mathematics", "Math", ["alg-1"]));
    }

    [Fact]
    public void Falls_back_to_department_name_match_when_no_required_courses()
    {
        Assert.True(GradMatch.CourseMatchesCategory("BIO", "Science", "Science", []));
        Assert.False(GradMatch.CourseMatchesCategory("ENG-9", "English", "Science", []));
    }

    [Fact]
    public void Handles_missing_fields_safely()
    {
        Assert.False(GradMatch.CourseMatchesCategory(null, null, "X", []));
        Assert.False(GradMatch.CourseMatchesCategory("A", null, "Y", null));
    }

    /// <summary>
    /// Not in the legacy file, but implied by its two `.length > 0` guards and worth pinning: an EMPTY code can
    /// never match a required list, and an EMPTY department can never match a category — even when the category
    /// name is itself empty, where a naive equality check would return true and quietly count every
    /// department-less course toward it.
    /// </summary>
    [Fact]
    public void Empty_code_and_empty_department_never_match()
    {
        Assert.False(GradMatch.CourseMatchesCategory("", "English", "English", ["", "ENG-9"]));
        Assert.False(GradMatch.CourseMatchesCategory("BIO", "", "", []));
    }

    /// <summary>
    /// Department matching is case-insensitive on BOTH sides — legacy lowercases the department and the category
    /// before comparing, so a "mathematics" department matches a "Mathematics" category.
    /// </summary>
    [Fact]
    public void Department_match_is_case_insensitive_on_both_sides()
    {
        Assert.True(GradMatch.CourseMatchesCategory("ALG-1", "mathematics", "Mathematics", []));
        Assert.True(GradMatch.CourseMatchesCategory("ALG-1", "MATHEMATICS", "mathematics", null));
    }
}
