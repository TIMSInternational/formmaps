using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using Xunit;

namespace FormMaps.UnitTests.Assessments;

public sealed class LiaQuestionServingTests
{
    private static readonly RequestContext Context = RequestContext.Anonymous();

    [Fact]
    public async Task Practice_questions_never_include_the_answer_key()
    {
        var questions = await LiaQuestionServing.FetchPracticeQuestionsAsync(
            FakeResolver.OverWholeBank(), Context, "pattern_recognition", "es");
        Assert.NotEmpty(questions);
        Assert.All(questions, q => Assert.True(q.IsPractice));
    }

    [Fact]
    public async Task Assessment_questions_are_ordered_by_item_number_and_capped_at_take()
    {
        var questions = await LiaQuestionServing.FetchAssessmentQuestionsAsync(
            FakeResolver.OverWholeBank(), Context, "numerical_speed", "es", take: 60);
        Assert.Equal(60, questions.Count);
        for (var i = 1; i < questions.Count; i++)
        {
            Assert.True(questions[i].ItemNumber > questions[i - 1].ItemNumber);
        }
    }

    [Fact]
    public async Task EN_language_swaps_verbal_practice_item_2_text()
    {
        var resolver = FakeResolver.OverWholeBank();
        var es = (await LiaQuestionServing.FetchPracticeQuestionsAsync(resolver, Context, "verbal_reasoning", "es"))
            .Single(q => q.ItemNumber == 2);
        var en = (await LiaQuestionServing.FetchPracticeQuestionsAsync(resolver, Context, "verbal_reasoning", "en"))
            .Single(q => q.ItemNumber == 2);
        Assert.NotEqual(es.QuestionData.GetRawText(), en.QuestionData.GetRawText());
    }

    /// <summary>
    /// Served ids are the REAL catalog ids, NOT a value derived from the natural key. This is the unit
    /// pin on the whole point of the resolver: lia_responses.question_id carries an FK to
    /// lia_questions(id), so anything derivable-but-invented would be rejected by Postgres.
    /// </summary>
    [Fact]
    public async Task Served_ids_come_from_the_resolver_not_from_the_natural_key()
    {
        var resolver = FakeResolver.OverWholeBank();
        var questions = await LiaQuestionServing.FetchPracticeQuestionsAsync(
            resolver, Context, "pattern_recognition", "es");

        Assert.All(questions, q => Assert.Equal(
            resolver.IdFor("pattern_recognition", q.ItemNumber, isPractice: true), q.Id));
        // Specifically NOT the old synthesized "{subtest}:{item}:{kind}" shape.
        Assert.All(questions, q => Assert.DoesNotContain(':', q.Id));
    }

    /// <summary>
    /// Catalog drift must fail loudly. Serving a question whose id does not exist would hand the
    /// candidate an id that violates lia_responses' FK the instant they answer it, so the error has to
    /// surface at serve time rather than as an opaque 23503 later.
    /// </summary>
    [Fact]
    public async Task Missing_catalog_row_throws_rather_than_serving_an_unusable_id()
    {
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            LiaQuestionServing.FetchPracticeQuestionsAsync(
                FakeResolver.Empty(), Context, "pattern_recognition", "es"));

        Assert.Contains("catalog drift", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task FindById_maps_a_real_catalog_id_back_onto_the_static_bank()
    {
        var resolver = FakeResolver.OverWholeBank();
        var id = resolver.IdFor("pattern_recognition", 7, isPractice: false);

        var found = await LiaQuestionServing.FindByIdAsync(resolver, Context, id);

        Assert.NotNull(found);
        Assert.Equal("pattern_recognition", found.Subtest);
        Assert.Equal(7, found.ItemNumber);
        Assert.False(found.IsPractice);
    }

    [Fact]
    public async Task FindById_returns_null_for_an_id_the_catalog_does_not_carry()
    {
        var found = await LiaQuestionServing.FindByIdAsync(
            FakeResolver.OverWholeBank(), Context, Guid.NewGuid().ToString());

        Assert.Null(found);
    }

    /// <summary>
    /// In-memory stand-in for <see cref="ILiaQuestionIdResolver"/>. Generates one uuid per entry of the
    /// real embedded bank, exactly as the DB seed does — deliberately uuid-shaped so no test can
    /// accidentally pass by depending on an id being derivable from the natural key.
    /// </summary>
    private sealed class FakeResolver : ILiaQuestionIdResolver
    {
        private readonly Dictionary<LiaQuestionKey, string> _idByKey = [];
        private readonly Dictionary<string, LiaQuestionKey> _keyById = new(StringComparer.Ordinal);

        public static FakeResolver Empty() => new();

        public static FakeResolver OverWholeBank()
        {
            var resolver = new FakeResolver();
            foreach (var q in LiaAnswerScoring.BuildQuestionBank())
            {
                var key = new LiaQuestionKey(q.Subtest, q.ItemNumber, q.IsPractice);
                var id = Guid.NewGuid().ToString();
                resolver._idByKey[key] = id;
                resolver._keyById[id] = key;
            }

            return resolver;
        }

        public string IdFor(string subtest, int itemNumber, bool isPractice) =>
            _idByKey[new LiaQuestionKey(subtest, itemNumber, isPractice)];

        public Task WarmAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.CompletedTask; // Already in memory — nothing to load.

        public Task<string?> ResolveAsync(
            RequestContext context, string subtest, int itemNumber, bool isPractice,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(_idByKey.TryGetValue(new LiaQuestionKey(subtest, itemNumber, isPractice), out var id)
                ? id
                : null);

        public Task<LiaQuestionKey?> ResolveReverseAsync(
            RequestContext context, string questionId, CancellationToken cancellationToken = default) =>
            Task.FromResult(_keyById.TryGetValue(questionId, out var key) ? key : (LiaQuestionKey?)null);
    }
}
