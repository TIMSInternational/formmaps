using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace FormMaps.UnitTests.Insights;

/// <summary>
/// Unit tests for the personality half of the polyglot insights funnel (formmaps#144) — the trigger call
/// <c>PersonalitySessionWriter.CompleteAsync</c> was missing. Personality became a REQUIRED leg of the
/// completion gate on 2026-07-30, and .NET owns the WHOLE personality lifecycle (no Node-side twin can
/// fire it instead), so a student who completed personality LAST generated no insights at all: their gate
/// flipped in a writer that sent no signal, and the funnel has no lazy/on-read generation path.
///
/// These pin the four properties that make the fix correct, driven against a scripted in-memory
/// <see cref="ScriptedPersonalityDatabase"/> (no Testcontainers — the real-Postgres behavior of this
/// writer lives in FormMaps.IntegrationTests' PersonalitySessionWriterTests):
///
/// 1. A durable completion fires ONCE, for the SESSION OWNER, with the source string
///    "assessment.personality.completed" — the audit-event-mirroring convention the two shipped call
///    sites already use ("assessment.lia.completed", "evaluation.feedback.submitted").
/// 2. It fires AFTER the completing transaction commits (same ordering rule as the completion audit
///    events), never inside it — a signal for a write that then rolled back would be a lie.
/// 3. An idempotent replay does NOT re-fire: a completed session is never rescored, and retried
///    /complete calls are exactly the routine client behavior that branch exists for.
/// 4. Non-completing paths (incomplete coverage, non-owner) fire NOTHING.
/// </summary>
public sealed class PersonalityInsightsTriggerTests
{
    private const string OwnerId = "user-personality-1";
    private const string SessionId = "session-personality-1";
    private const string Variant = "laboral";        // 40 items — the smaller bank

    private static readonly int FullCoverage = PersonalityItemBank.ItemCount(Variant);

    [Fact]
    public async Task Complete_fires_the_insights_trigger_once_for_the_owner_after_the_commit()
    {
        var database = new ScriptedPersonalityDatabase(OwnerId, Variant, answeredItems: FullCoverage);
        var trigger = new RecordingInsightsTrigger(() => database.Commits);
        var writer = MakeWriter(database, trigger);

        var outcome = await writer.CompleteAsync(Ctx(OwnerId), SessionId, OwnerId);

        Assert.Equal(PersonalityWriteStatus.Ok, outcome.Status);
        Assert.Equal(1, database.CompletionUpdates);   // it really did complete

        var fire = Assert.Single(trigger.Fires);
        // The EVALUATED/completing student, and the source convention shared with the two shipped sites.
        Assert.Equal(OwnerId, fire.UserId);
        Assert.Equal("assessment.personality.completed", fire.Source);
        // Post-commit ordering: the completing transaction had already committed when the fire happened.
        Assert.Equal(1, fire.CommitsAtFireTime);
    }

    [Fact]
    public async Task Complete_locks_the_session_row_before_deciding_to_fire()
    {
        var database = new ScriptedPersonalityDatabase(OwnerId, Variant, answeredItems: FullCoverage);
        var writer = MakeWriter(database, new RecordingInsightsTrigger(() => database.Commits));

        await writer.CompleteAsync(Ctx(OwnerId), SessionId, OwnerId);

        // The fire/no-fire decision reads a FOR UPDATE-locked row, so two concurrent completions cannot
        // both see 'in_progress' and both signal (the TOCTOU pin the integration tests exercise for real).
        var sessionSelect = Assert.Single(
            database.ExecutedSql,
            sql => sql.StartsWith("SELECT \"user_id\"", StringComparison.Ordinal));
        Assert.Contains("FOR UPDATE", sessionSelect, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Complete_replayed_on_an_already_completed_session_does_not_re_fire()
    {
        var database = new ScriptedPersonalityDatabase(OwnerId, Variant, answeredItems: FullCoverage);
        var trigger = new RecordingInsightsTrigger(() => database.Commits);
        var writer = MakeWriter(database, trigger);

        var first = await writer.CompleteAsync(Ctx(OwnerId), SessionId, OwnerId);
        var second = await writer.CompleteAsync(Ctx(OwnerId), SessionId, OwnerId);

        Assert.Equal(PersonalityWriteStatus.Ok, first.Status);
        Assert.Equal(PersonalityWriteStatus.Ok, second.Status);   // replay still returns the results
        Assert.Equal(1, database.CompletionUpdates);              // ... but performed no second write
        Assert.Single(trigger.Fires);                             // ... and sent no second signal
    }

    [Fact]
    public async Task Complete_with_incomplete_coverage_does_not_fire()
    {
        var database = new ScriptedPersonalityDatabase(OwnerId, Variant, answeredItems: FullCoverage - 1);
        var trigger = new RecordingInsightsTrigger(() => database.Commits);
        var writer = MakeWriter(database, trigger);

        var outcome = await writer.CompleteAsync(Ctx(OwnerId), SessionId, OwnerId);

        Assert.Equal(PersonalityWriteStatus.IncompleteCoverage, outcome.Status);
        Assert.Equal(0, database.CompletionUpdates);
        // No durable completion, no gate flip, no signal.
        Assert.Empty(trigger.Fires);
    }

    [Fact]
    public async Task Complete_by_a_non_owner_does_not_fire()
    {
        var database = new ScriptedPersonalityDatabase(OwnerId, Variant, answeredItems: FullCoverage);
        var trigger = new RecordingInsightsTrigger(() => database.Commits);
        var writer = MakeWriter(database, trigger);

        var outcome = await writer.CompleteAsync(Ctx("stranger"), SessionId, "stranger");

        Assert.Equal(PersonalityWriteStatus.SessionNotFound, outcome.Status);
        Assert.Equal(0, database.CompletionUpdates);
        // A denied completion signals nothing — least of all for the stranger's own id.
        Assert.Empty(trigger.Fires);
    }

    // ==============================================================================================
    // Helpers
    // ==============================================================================================

    private static PersonalitySessionWriter MakeWriter(
        ScriptedPersonalityDatabase database, IInsightsTrigger trigger)
    {
        // The results read is a separate read-only path (proven end-to-end by the integration tests);
        // here it only has to hand CompleteAsync a non-null bundle so the outcome status is the real one.
        var reader = new Mock<IPersonalityResultReader>(MockBehavior.Loose);
        reader
            .Setup(r => r.ReadBySessionAsync(
                It.IsAny<RequestContext>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(StubResults());

        return new PersonalitySessionWriter(
            database, reader.Object, trigger, NullLogger<PersonalitySessionWriter>.Instance);
    }

    private static PersonalityResults StubResults()
    {
        using var empty = JsonDocument.Parse("{}");
        return new PersonalityResults(
            SessionId: SessionId,
            UserName: "Test User",
            Variant: Variant,
            Language: "es",
            Type: "ISTP",
            Score: new PersonalityScoreDto(Variant, "ISTP", empty.RootElement.Clone()),
            DimensionScores: [],
            Profile: PersonalityProfileBank.Localize(PersonalityProfileBank.GetByType("ISTP"), "es"),
            StartedAt: null,
            CompletedAt: null,
            ViolationCount: 0,
            FlagForReview: false);
    }

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "student", $"{userId}@e.st", "Test User"),
            schoolId: null,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);

    /// <summary>
    /// Recording <see cref="IInsightsTrigger"/> double. Besides the (userId, source) pair it snapshots the
    /// scripted DB's commit count at fire time, which is how the post-commit ordering rule is pinned.
    /// </summary>
    private sealed class RecordingInsightsTrigger(Func<int> commitCount) : IInsightsTrigger
    {
        public List<(string UserId, string Source, int CommitsAtFireTime)> Fires { get; } = [];

        public Task TriggerAsync(string userId, string source, CancellationToken cancellationToken = default)
        {
            Fires.Add((userId, source, commitCount()));
            return Task.CompletedTask;
        }
    }
}
