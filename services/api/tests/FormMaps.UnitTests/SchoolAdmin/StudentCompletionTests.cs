using FormMaps.Application.SchoolAdmin;

namespace FormMaps.UnitTests.SchoolAdmin;

/// <summary>
/// Pins the pure completion verdict (port of computeStudentCompletion): liaCompleted = distinct exam-type
/// count (>=5 done), pcaCompleted = EXISTENCE of an isCompleted PCA row (not mere row existence), the 360
/// THRESHOLD of min(evalTotal, 3) rather than 100%, and — since 2026-07-30 — personalityCompleted as a
/// required 4th gate, bypassable only via legacyUnlockGrandfathered.
/// </summary>
public sealed class StudentCompletionTests
{
    [Fact]
    public void All_gates_met_is_done()
    {
        var v = StudentCompletion.Compute(
            ["PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation"],
            [true, true, true],
            [true],
            personalityCompleted: true,
            legacyUnlockGrandfathered: false);

        Assert.Equal(5, v.LiaCompleted);
        Assert.True(v.PcaCompleted);
        Assert.Equal(3, v.EvalCompleted);
        Assert.True(v.AllDone);
    }

    [Fact]
    public void Lia_counts_distinct_types_duplicates_do_not_reach_five()
    {
        var v = StudentCompletion.Compute(
            ["PatternRecognition", "PatternRecognition", "VerbalReasoning"], [true, true, true], [true],
            personalityCompleted: true, legacyUnlockGrandfathered: false);

        Assert.Equal(2, v.LiaCompleted);  // distinct, not 3
        Assert.False(v.AllDone);          // <5 lia
    }

    [Fact]
    public void Eval360_threshold_is_min_evalTotal_3_not_hundred_percent()
    {
        // 5 groups, only 3 completed -> done (min(5,3)=3). The 5th unresponsive evaluator can't block it.
        var five = StudentCompletion.Compute(
            ["PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation"],
            [true, true, true, false, false], [true],
            personalityCompleted: true, legacyUnlockGrandfathered: false);
        Assert.True(five.AllDone);

        // 2 groups, only 1 completed -> NOT done (min(2,3)=2, need 2).
        var two = StudentCompletion.Compute(
            ["PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation"],
            [true, false], [true],
            personalityCompleted: true, legacyUnlockGrandfathered: false);
        Assert.False(two.AllDone);
    }

    [Fact]
    public void Pca_existence_is_not_completion()
    {
        // A PCA row that is NOT isCompleted must not satisfy the DISC gate.
        var v = StudentCompletion.Compute(
            ["PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation"],
            [true, true, true],
            [false],
            personalityCompleted: true, legacyUnlockGrandfathered: false);

        Assert.False(v.PcaCompleted);
        Assert.False(v.AllDone);
    }

    [Theory]
    [InlineData(4, false)]   // 4 distinct types -> lia NOT done
    [InlineData(5, true)]    // 5 distinct types -> lia done
    public void Lia_boundary_is_exactly_five_distinct_types(int distinctTypes, bool expectedDone)
    {
        var types = new[] { "PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation" }
            .Take(distinctTypes)
            .ToArray();

        // Other gates (3 completed evaluators + a completed PCA + Personality) are satisfied, so AllDone tracks the LIA gate.
        var v = StudentCompletion.Compute(types, [true, true, true], [true],
            personalityCompleted: true, legacyUnlockGrandfathered: false);

        Assert.Equal(distinctTypes, v.LiaCompleted);
        Assert.Equal(expectedDone, v.AllDone);
    }

    [Theory]
    [InlineData(1, 1, true)]   // min(1,3)=1, have 1 -> done
    [InlineData(2, 1, false)]  // min(2,3)=2, have 1 -> not done
    [InlineData(2, 2, true)]   // have 2 -> done
    [InlineData(3, 2, false)]  // min(3,3)=3, have 2 -> not done
    [InlineData(3, 3, true)]   // have 3 -> done
    public void Eval360_threshold_edges_evalTotal_1_2_3(int evalTotal, int evalCompleted, bool expectedDone)
    {
        var lia = new[] { "PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation" };
        var groups = Enumerable.Range(0, evalTotal).Select(i => i < evalCompleted).ToList();

        // lia + pca + personality satisfied -> AllDone tracks the 360 gate
        var v = StudentCompletion.Compute(lia, groups, [true],
            personalityCompleted: true, legacyUnlockGrandfathered: false);

        Assert.Equal(evalCompleted, v.EvalCompleted);
        Assert.Equal(expectedDone, v.AllDone);
    }

    [Fact]
    public void No_evaluators_means_not_done()
    {
        var v = StudentCompletion.Compute(
            ["PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation"],
            [],
            [true],
            personalityCompleted: true, legacyUnlockGrandfathered: false);

        Assert.Equal(0, v.EvalTotal);
        Assert.False(v.AllDone);  // evalTotal > 0 required
    }

    [Fact]
    public void Personality_required_when_not_grandfathered()
    {
        // MIL 5/5 + 360 3/3 + PCA done, but Personality NOT done -> NOT AllDone (4th assessment is required).
        var v = StudentCompletion.Compute(
            ["PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation"],
            [true, true, true],
            [true],
            personalityCompleted: false, legacyUnlockGrandfathered: false);

        Assert.False(v.PersonalityCompleted);
        Assert.False(v.AllDone);
    }

    [Fact]
    public void LegacyUnlockGrandfathered_bypasses_the_personality_requirement()
    {
        var v = StudentCompletion.Compute(
            ["PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation"],
            [true, true, true],
            [true],
            personalityCompleted: false, legacyUnlockGrandfathered: true);

        Assert.False(v.PersonalityCompleted);
        Assert.True(v.AllDone);
    }
}
