# FM-029: LIA Session Write Lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the full LIA assessment session write lifecycle (7 write endpoints + 3 reads sharing one `lia_assessment_sessions` row) from the legacy Node service to `.NET`, so the whole surface can cut over together under one flag with no split ownership of the row.

**Architecture:** Extend the existing `LiaSessionWriter` (which currently only has `CompleteAsync`) with 6 new methods, each opening its own `FOR UPDATE`-locked writable session exactly like `CompleteAsync` does. A new `LiaSessionReader` gets the 3 reads that share the same lazy-expiry logic. Question serving reuses the ALREADY-PORTED static `LiaAnswerScoring.BuildQuestionBank()` (no new DB table needed — `lia_questions` is static, read-only content already embedded as a resource) plus a newly-ported EN verbal-twin question-text bank (currently only the *answer* override exists in `.NET`, not the question *text*).

**Tech Stack:** C#/.NET 10, raw Npgsql SQL (no EF), Testcontainers-backed xunit integration tests, embedded JSON resources for static content.

## Global Constraints

- Raw Npgsql SQL only, no EF — matches every existing file in `FormMaps.Infrastructure/Assessments/`.
- Every write opens a `FOR UPDATE`-locked writable session via `IFormMapsDatabaseSessionFactory.OpenWritableAsync(context, cancellationToken)`, exactly like `LiaSessionWriter.CompleteAsync`.
- Every UPDATE is conditional (`WHERE` guards matching the exact state precondition) with fail-closed handling on 0 rows affected (log + throw `InvalidOperationException`) — never silently succeed on a write that didn't land.
- Timestamps bound via `DbType.DateTime2` (maps to Postgres `timestamp` without timezone, matching Prisma's `@db.Timestamp(3)` columns) — never `Kind=Utc`, which would infer `timestamptz` and apply a server-timezone-dependent cast.
- JSONB columns serialized with a shared `JsonSerializerOptions` instance, matching the existing `LiaSessionWriter` pattern.
- Every not-found/ownership-mismatch branch returns the uniform IDOR-safe "not found" — never leaks existence.
- `snake_case` JSON property names on every response DTO (`[property: JsonPropertyName(...)]`), matching every existing Lia DTO.
- No behavior change to the currently-untouched personality domain's flags/routes.

---

### Task 1: Schema fixture update + EN verbal-twin question-text port

**Files:**
- Modify: `services/api/tests/FormMaps.IntegrationTests/Assessments/Data/lia-schema.sql` (add `reentry_count`, `locked_at`)
- Create: `services/api/src/FormMaps.Application/Assessments/Data/lia-verbal-en.json`
- Modify: `services/api/src/FormMaps.Application/FormMaps.Application.csproj` (embed the new resource, mirroring the existing `lia-question-bank.json` entry)
- Create: `services/api/src/FormMaps.Application/Assessments/LiaVerbalEn.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Assessments/LiaVerbalEnTests.cs`

**Interfaces:**
- Produces: `LiaVerbalEn.GetQuestionText(int itemNumber, bool isPractice): JsonElement?` — returns the EN question data override, or `null` if none exists for that item (mirrors legacy `getVerbalEn`, which returns `undefined` for the ~289 non-diverging verbal items). Task 4 and Task 5 consume this.

- [ ] **Step 1: Add the missing columns to the test schema**

The prod columns already exist (Node's `20260725100000_lia_reentry_limit` migration) but the `.NET` Testcontainers harness schema doesn't have them yet. Edit `lia-schema.sql`, inside the `lia_assessment_sessions` table definition, add after `"flag_for_review"`:

```sql
    "reentry_count" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMP(3),
```

- [ ] **Step 2: Export the EN verbal bank as JSON (mechanical, not hand-transcribed)**

This is certified, human-reviewed instrument content (`VERBAL_EN_REVIEWED_BY_HUMAN = true` in the source) — transcribe it by running the actual source, never by hand. From `formmaps-platform/api`, run:

```bash
npx tsx -e '
import { VERBAL_EN } from "./src/lib/lia-core/verbal-en.js";
console.log(JSON.stringify(VERBAL_EN, null, 1));
' > /tmp/lia-verbal-en-export.json
```

Copy `/tmp/lia-verbal-en-export.json` to `services/api/src/FormMaps.Application/Assessments/Data/lia-verbal-en.json` verbatim (no edits).

- [ ] **Step 3: Embed the resource**

In `FormMaps.Application.csproj`, find the `<EmbeddedResource Include="Assessments\Data\lia-question-bank.json" />` line and add immediately after it:

```xml
    <EmbeddedResource Include="Assessments\Data\lia-verbal-en.json" />
```

- [ ] **Step 4: Write the failing unit test**

```csharp
// services/api/tests/FormMaps.UnitTests/Assessments/LiaVerbalEnTests.cs
using FormMaps.Application.Assessments;
using Xunit;

namespace FormMaps.UnitTests.Assessments;

public sealed class LiaVerbalEnTests
{
    [Fact]
    public void Practice_item_2_has_an_EN_override()
    {
        var text = LiaVerbalEn.GetQuestionText(itemNumber: 2, isPractice: true);
        Assert.NotNull(text);
    }

    [Fact]
    public void Assessment_item_with_no_divergence_returns_null()
    {
        // Item 2 of the assessment bank is not one of the documented divergent items.
        var text = LiaVerbalEn.GetQuestionText(itemNumber: 2, isPractice: false);
        Assert.Null(text);
    }

    [Fact]
    public void Nonexistent_item_number_returns_null_not_throws()
    {
        var text = LiaVerbalEn.GetQuestionText(itemNumber: 9999, isPractice: true);
        Assert.Null(text);
    }
}
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd services/api && dotnet test --filter LiaVerbalEnTests`
Expected: FAIL — `LiaVerbalEn` does not exist.

- [ ] **Step 6: Implement**

```csharp
// services/api/src/FormMaps.Application/Assessments/LiaVerbalEn.cs
using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Port of legacy lib/lia-core/verbal-en.ts — the English verbal-reasoning question TEXT bank (distinct
/// from LiaAnswerScoring.GetVerbalAnswerForLanguage, which only overrides the ANSWER KEY). Certified,
/// human-reviewed instrument content (VERBAL_EN_REVIEWED_BY_HUMAN=true in the source) — the embedded JSON
/// is a mechanical export of the TS source, never hand-transcribed.
/// </summary>
public static class LiaVerbalEn
{
    private static readonly JsonDocument Bank = LoadBank();

    /// <summary>
    /// The EN question-data override for this item, or null if this item doesn't diverge from ES (legacy
    /// getVerbalEn returns undefined for ~289 of the 305 rows — only documented divergent items have an
    /// entry). Practice and assessment banks are keyed separately, matching the source shape.
    /// </summary>
    public static JsonElement? GetQuestionText(int itemNumber, bool isPractice)
    {
        var section = isPractice ? "practice" : "assessment";
        if (!Bank.RootElement.TryGetProperty(section, out var sectionElement))
        {
            return null;
        }

        return sectionElement.TryGetProperty(itemNumber.ToString(), out var item) ? item.Clone() : null;
    }

    private static JsonDocument LoadBank()
    {
        var assembly = typeof(LiaVerbalEn).Assembly;
        var resourceName = assembly.GetManifestResourceNames()
            .Single(name => name.EndsWith("lia-verbal-en.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException("Embedded lia-verbal-en.json not found.");
        return JsonDocument.Parse(stream);
    }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd services/api && dotnet test --filter LiaVerbalEnTests`
Expected: PASS (3 tests). If Step 4's `Practice_item_2_has_an_EN_override` fails, re-check the exported JSON's key shape against the source's `VERBAL_EN.practice` object (keys may be numeric-string or the export may have wrapped them differently — adjust `GetQuestionText`'s section-key lookup to match the ACTUAL exported shape, not the assumption above).

- [ ] **Step 8: Commit**

```bash
cd services/api
git add tests/FormMaps.IntegrationTests/Assessments/Data/lia-schema.sql \
        src/FormMaps.Application/Assessments/Data/lia-verbal-en.json \
        src/FormMaps.Application/FormMaps.Application.csproj \
        src/FormMaps.Application/Assessments/LiaVerbalEn.cs \
        tests/FormMaps.UnitTests/Assessments/LiaVerbalEnTests.cs
git commit -m "feat(lia): add reentry_count/locked_at to test schema; port EN verbal-twin question text"
```

---

### Task 2: Question-serving DTOs + bank query helper

**Files:**
- Create: `services/api/src/FormMaps.Application/Assessments/LiaSessionWrite.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Assessments/LiaQuestionServingTests.cs`

**Interfaces:**
- Consumes: `LiaAnswerScoring.BuildQuestionBank()`, `LiaAnswerScoring.GetVerbalAnswerForLanguage`, `LiaVerbalEn.GetQuestionText` (Task 1).
- Produces: `ClientQuestion` record, `LiaQuestionServing.FetchPracticeQuestions(string subtest, string language): IReadOnlyList<ClientQuestion>`, `LiaQuestionServing.FetchAssessmentQuestions(string subtest, string language, int take): IReadOnlyList<ClientQuestion>` (ordered by item number, answer key stripped) — Tasks 3-6 consume both. Also every result/DTO record for the write surface: `SessionStartPayload`, `AnswerResult`, `CheckAccessResult`, `PracticeAnswerResult`, `SubtestStartResult`, `ViolationsResult`, and the `LiaWriteStatus`-style outcome enums each endpoint needs.

- [ ] **Step 1: Write the failing unit tests**

```csharp
// services/api/tests/FormMaps.UnitTests/Assessments/LiaQuestionServingTests.cs
using FormMaps.Application.Assessments;
using Xunit;

namespace FormMaps.UnitTests.Assessments;

public sealed class LiaQuestionServingTests
{
    [Fact]
    public void Practice_questions_never_include_the_answer_key()
    {
        var questions = LiaQuestionServing.FetchPracticeQuestions("pattern_recognition", "es");
        Assert.NotEmpty(questions);
        Assert.All(questions, q => Assert.True(q.IsPractice));
    }

    [Fact]
    public void Assessment_questions_are_ordered_by_item_number_and_capped_at_take()
    {
        var questions = LiaQuestionServing.FetchAssessmentQuestions("numerical_speed", "es", take: 60);
        Assert.Equal(60, questions.Count);
        for (var i = 1; i < questions.Count; i++)
        {
            Assert.True(questions[i].ItemNumber > questions[i - 1].ItemNumber);
        }
    }

    [Fact]
    public void EN_language_swaps_verbal_practice_item_2_text()
    {
        var es = LiaQuestionServing.FetchPracticeQuestions("verbal_reasoning", "es")
            .Single(q => q.ItemNumber == 2);
        var en = LiaQuestionServing.FetchPracticeQuestions("verbal_reasoning", "en")
            .Single(q => q.ItemNumber == 2);
        Assert.NotEqual(es.QuestionData.GetRawText(), en.QuestionData.GetRawText());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/api && dotnet test --filter LiaQuestionServingTests`
Expected: FAIL — `LiaQuestionServing`/`ClientQuestion` do not exist.

- [ ] **Step 3: Implement the DTOs and query helper**

```csharp
// services/api/src/FormMaps.Application/Assessments/LiaSessionWrite.cs
using System.Text.Json;
using System.Text.Json.Serialization;

namespace FormMaps.Application.Assessments;

public sealed record ClientQuestion(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("subtest")] string Subtest,
    [property: JsonPropertyName("item_number")] int ItemNumber,
    [property: JsonPropertyName("question_data")] JsonElement QuestionData,
    [property: JsonPropertyName("is_practice")] bool IsPractice);

public static class LiaQuestionServing
{
    /// <summary>
    /// legacy fetchPracticeQuestions: all practice items for a subtest, ordered, answer key stripped,
    /// EN question-text swapped in for verbal_reasoning where LiaVerbalEn has an override.
    /// </summary>
    public static IReadOnlyList<ClientQuestion> FetchPracticeQuestions(string subtest, string language) =>
        LiaAnswerScoring.BuildQuestionBank()
            .Where(q => q.Subtest == subtest && q.IsPractice)
            .OrderBy(q => q.ItemNumber)
            .Select(q => ToClientQuestion(q, language))
            .ToList();

    /// <summary>
    /// legacy the assessment-items query inside startSession Gate 3 / startSubtest: live (non-practice)
    /// items for a subtest, ordered, capped at the subtest's item count.
    /// </summary>
    public static IReadOnlyList<ClientQuestion> FetchAssessmentQuestions(string subtest, string language, int take) =>
        LiaAnswerScoring.BuildQuestionBank()
            .Where(q => q.Subtest == subtest && !q.IsPractice)
            .OrderBy(q => q.ItemNumber)
            .Take(take)
            .Select(q => ToClientQuestion(q, language))
            .ToList();

    /// <summary>Single-item lookup by subtest+itemNumber (assessment only) — legacy submitAnswer's question fetch.</summary>
    public static LiaQuestionBankItem? FindAssessmentQuestion(string subtest, int itemNumber) =>
        LiaAnswerScoring.BuildQuestionBank()
            .FirstOrDefault(q => q.Subtest == subtest && !q.IsPractice && q.ItemNumber == itemNumber);

    /// <summary>Single-item lookup by id (bank rows are keyed by (subtest,itemNumber,isPractice) — see Note below).</summary>
    public static LiaQuestionBankItem? FindById(string questionId) => ParseId(questionId) is var (subtest, itemNumber, isPractice)
        ? LiaAnswerScoring.BuildQuestionBank().FirstOrDefault(
            q => q.Subtest == subtest && q.ItemNumber == itemNumber && q.IsPractice == isPractice)
        : null;

    // legacy lia_questions.id is a real DB-generated cuid; the static .NET bank has no such id. Synthesize
    // a stable, parseable id instead: "{subtest}:{itemNumber}:{practice|assessment}". ClientQuestion.Id and
    // every /answer, /practice/answer request's question_id use THIS id going forward once the write flag
    // is on — the frontend never persists a raw id across the cutover boundary (a fresh /start or
    // /practice call always re-serves current ids), so there is no stale-id compatibility concern.
    private static string BuildId(LiaQuestionBankItem q) =>
        $"{q.Subtest}:{q.ItemNumber}:{(q.IsPractice ? "practice" : "assessment")}";

    private static (string Subtest, int ItemNumber, bool IsPractice)? ParseId(string id)
    {
        var parts = id.Split(':');
        if (parts.Length != 3 || !int.TryParse(parts[1], out var itemNumber))
        {
            return null;
        }

        return (parts[0], itemNumber, parts[2] == "practice");
    }

    private static ClientQuestion ToClientQuestion(LiaQuestionBankItem q, string language)
    {
        var data = q.QuestionData;
        if (q.Subtest == "verbal_reasoning" && language == "en")
        {
            var en = LiaVerbalEn.GetQuestionText(q.ItemNumber, q.IsPractice);
            if (en is { } enData)
            {
                data = enData;
            }
        }

        return new ClientQuestion(BuildId(q), q.Subtest, q.ItemNumber, data, q.IsPractice);
    }
}
```

**Note on question ids**: legacy `lia_questions.id` is a real Prisma-generated id persisted in `lia_responses.question_id`. Since `.NET` has no `lia_questions` table, `BuildId` above synthesizes a deterministic id instead — this is safe ONLY because responses keyed against these ids are themselves new rows written by the `.NET` port (Task 5/6), not cross-referenced against any pre-existing Node-written `lia_responses` row. A session that already has Node-written responses when the flag flips (an in-flight session) would have Node-shaped question ids in its existing `lia_responses` rows that don't match this scheme — this is exactly why the design's rollout step requires a verified-zero-in-progress-sessions window before flipping, not a code-level compatibility shim.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/api && dotnet test --filter LiaQuestionServingTests`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add services/api/src/FormMaps.Application/Assessments/LiaSessionWrite.cs \
        services/api/tests/FormMaps.UnitTests/Assessments/LiaQuestionServingTests.cs
git commit -m "feat(lia): question-serving DTOs + static-bank query helper for the session write surface"
```

---

### Task 3: `StartAsync` — reentry-lock + shared expiry/timeout helpers

**Files:**
- Modify: `services/api/src/FormMaps.Application/Assessments/LiaSessionWrite.cs` (add `SessionStartPayload`, `LiaStartStatus`, `LiaStartOutcome`, `ILiaSessionWriter.StartAsync` signature)
- Modify: `services/api/src/FormMaps.Infrastructure/Assessments/LiaSessionWriter.cs` (add `StartAsync` + shared private helpers `ExpireIfPastDeadlineAsync`/`ApplyTimeoutAsync`/`AdvancePastSubtestAsync`/`RecordSubtestEndAsync`)
- Test: `services/api/tests/FormMaps.IntegrationTests/Assessments/LiaSessionStartTests.cs`

**Interfaces:**
- Consumes: `LiaQuestionServing.FetchPracticeQuestions`/`FetchAssessmentQuestions` (Task 2).
- Produces: `ILiaSessionWriter.StartAsync(RequestContext context, string userId, string language, CancellationToken ct): Task<LiaStartOutcome>`. `LiaStartOutcome(LiaStartStatus Status, SessionStartPayload? Payload)`. `LiaStartStatus`: `Started`, `Locked`, `AlreadyCompleted`. Private helpers `ExpireIfPastDeadlineAsync(NpgsqlSession session, string sessionId, SessionRow row, CancellationToken ct): Task<TimeoutAdvanceResult?>` and `TimeoutAdvanceResult(string? NextSubtest, bool AssessmentComplete)` — Task 5's `SubmitAnswerAsync` and Task 6's reads consume these exact signatures.

- [ ] **Step 1: Add the new DTOs**

Append to `LiaSessionWrite.cs`:

```csharp
public sealed record SessionStartPayload(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("current_subtest")] string CurrentSubtest,
    [property: JsonPropertyName("practice_questions")] IReadOnlyList<ClientQuestion> PracticeQuestions,
    [property: JsonPropertyName("resume_mode")] string? ResumeMode = null,
    [property: JsonPropertyName("current_item")] int? CurrentItem = null,
    [property: JsonPropertyName("started_at")] string? StartedAt = null,
    [property: JsonPropertyName("time_limit_seconds")] int? TimeLimitSeconds = null,
    [property: JsonPropertyName("questions")] IReadOnlyList<ClientQuestion>? Questions = null);

public enum LiaStartStatus { Started, Locked, AlreadyCompleted }

public sealed record LiaStartOutcome(LiaStartStatus Status, SessionStartPayload? Payload);

public static class LiaSubtestOrder
{
    // legacy SUBTEST_ORDER (lib/lia-core/types.ts) — fixed instrument order, never re-derived from data.
    public static readonly IReadOnlyList<string> Order =
        ["pattern_recognition", "verbal_reasoning", "numerical_speed", "working_memory", "visual_rotation"];

    public static readonly IReadOnlyDictionary<string, int> ItemCounts = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["pattern_recognition"] = 60, ["verbal_reasoning"] = 50, ["numerical_speed"] = 60,
        ["working_memory"] = 60, ["visual_rotation"] = 60,
    };

    // legacy TIMER_GRACE_MS + per-subtest timeSeconds (lib/lia-core/types.ts SUBTEST_CONFIGS). Confirm these
    // exact values against the live source before shipping — transcribed here from the config table read
    // during design; do not guess if they don't match.
    public const int TimerGraceMs = 5000;
    public static readonly IReadOnlyDictionary<string, int> TimeSeconds = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["pattern_recognition"] = 600, ["verbal_reasoning"] = 900, ["numerical_speed"] = 480,
        ["working_memory"] = 480, ["visual_rotation"] = 480,
    };
}
```

**Before Step 2**: run `grep -n "SUBTEST_CONFIGS\|timeSeconds\|itemCount" formmaps-platform/api/src/lib/lia-core/types.ts` and correct `LiaSubtestOrder.ItemCounts`/`TimeSeconds` above against the REAL values — the numbers above are placeholders pending that check, not verified constants. Do not proceed to Step 2 until they're confirmed against source.

- [ ] **Step 2: Write the failing integration tests (the 2 adversarial ones first)**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Assessments/LiaSessionStartTests.cs
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

public sealed class LiaSessionStartTests : IClassFixture<LiaWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly LiaWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public LiaSessionStartTests(LiaWriteDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ------------------------------------------------------------------------------------------
    // Adversarial #1: the atomic-increment race Node's own fix addresses. K concurrent /start
    // calls on the SAME in_progress, unlocked session must count exactly K strikes — not fewer.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Concurrent_starts_on_the_same_session_count_every_strike_atomically()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0);
        var (writer, _) = MakeWriter();

        const int concurrency = 5;
        var tasks = Enumerable.Range(0, concurrency)
            .Select(_ => writer.StartAsync(Ctx(userId), userId, "es"))
            .ToArray();
        await Task.WhenAll(tasks);

        var reentryCount = await ReadReentryCountAsync(sessionId);
        Assert.Equal(concurrency, reentryCount);
    }

    // ------------------------------------------------------------------------------------------
    // Adversarial #2/#3 for StartAsync's OWN gate: exceeding MAX_REENTRIES locks the session and
    // every subsequent start (even a single one) is rejected, not silently allowed through.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Exceeding_max_reentries_locks_the_session()
    {
        const int maxReentries = 3; // legacy MAX_REENTRIES — confirm against lib/proctoring.ts before shipping.
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: maxReentries);
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartAsync(Ctx(userId), userId, "es");

        Assert.Equal(LiaStartStatus.Locked, outcome.Status);
        Assert.NotNull(await ReadLockedAtAsync(sessionId));
    }

    [Fact]
    public async Task Already_locked_session_rejects_start_without_incrementing_further()
    {
        var (userId, sessionId) = await SeedLockedSessionAsync();
        var (writer, _) = MakeWriter();

        var before = await ReadReentryCountAsync(sessionId);
        var outcome = await writer.StartAsync(Ctx(userId), userId, "es");
        var after = await ReadReentryCountAsync(sessionId);

        Assert.Equal(LiaStartStatus.Locked, outcome.Status);
        Assert.Equal(before, after); // legacy: locked check runs BEFORE the increment.
    }

    [Fact]
    public async Task Fresh_user_with_no_session_gets_a_new_practice_session()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartAsync(Ctx(userId), userId, "es");

        Assert.Equal(LiaStartStatus.Started, outcome.Status);
        Assert.Equal("practice", outcome.Payload!.CurrentSubtest is null ? "practice" : "practice");
        Assert.NotEmpty(outcome.Payload.PracticeQuestions);
        Assert.Null(outcome.Payload.ResumeMode); // fresh start carries no resume metadata.
    }

    [Fact]
    public async Task In_progress_session_with_a_live_clock_resumes_mid_subtest_without_resetting_it()
    {
        var startedAt = DateTime.UtcNow.AddSeconds(-30); // well within any subtest's time limit.
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0, subtestStartedAt: startedAt);
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartAsync(Ctx(userId), userId, "es");

        Assert.Equal(LiaStartStatus.Started, outcome.Status);
        Assert.Equal("mid_subtest", outcome.Payload!.ResumeMode);
        Assert.NotNull(outcome.Payload.Questions);
        // The clock must NOT reset: started_at returned must equal what was seeded.
        Assert.Equal(
            startedAt.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
            DateTime.Parse(outcome.Payload.StartedAt!).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
    }

    // --- helpers: MakeWriter/Ctx follow the exact pattern in LiaSessionWriterTests.cs — copy that
    // file's MakeWriter()/Ctx() implementations verbatim here (same fixture, same DI wiring). ---

    private (ILiaSessionWriter writer, ILogger<LiaSessionWriter> logger) MakeWriter()
    {
        // COPY VERBATIM from LiaSessionWriterTests.MakeWriter() in this same directory — do not
        // re-derive; the session-factory/DI construction must be byte-identical to reuse the fixture.
        throw new NotImplementedException("copy MakeWriter() body from LiaSessionWriterTests.cs");
    }

    private RequestContext Ctx(string userId)
    {
        // COPY VERBATIM from LiaSessionWriterTests.Ctx() in this same directory.
        throw new NotImplementedException("copy Ctx() body from LiaSessionWriterTests.cs");
    }

    private async Task SeedUserAsync(string userId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("INSERT INTO users (id, name, email) VALUES (@id, 'Test', 'test@formmaps.dev')", conn);
        cmd.Parameters.AddWithValue("id", userId);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<(string UserId, string SessionId)> SeedInProgressSessionAsync(
        int reentryCount, DateTime? subtestStartedAt = null)
    {
        var userId = Guid.NewGuid().ToString();
        var sessionId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        var subtestTimes = subtestStartedAt is { } st
            ? $$"""{"pattern_recognition":{"startedAt":"{{st:o}}"}}"""
            : "{}";
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO lia_assessment_sessions
                (id, user_id, status, current_subtest, current_item, practice_completed, subtest_times,
                 reentry_count, language, updated_at)
            VALUES (@id, @userId, 'in_progress', 'pattern_recognition', 1, '{"pattern_recognition":true}'::jsonb,
                    @subtestTimes::jsonb, @reentryCount, 'es', now())
            """, conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("userId", userId);
        cmd.Parameters.AddWithValue("subtestTimes", subtestTimes);
        cmd.Parameters.AddWithValue("reentryCount", reentryCount);
        await cmd.ExecuteNonQueryAsync();
        return (userId, sessionId);
    }

    private async Task<(string UserId, string SessionId)> SeedLockedSessionAsync()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 4);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "UPDATE lia_assessment_sessions SET locked_at = now() WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        await cmd.ExecuteNonQueryAsync();
        return (userId, sessionId);
    }

    private async Task<int> ReadReentryCountAsync(string sessionId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("SELECT reentry_count FROM lia_assessment_sessions WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task<DateTime?> ReadLockedAtAsync(string sessionId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("SELECT locked_at FROM lia_assessment_sessions WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        var result = await cmd.ExecuteScalarAsync();
        return result is DBNull ? null : (DateTime?)result;
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd services/api && dotnet test --filter LiaSessionStartTests`
Expected: FAIL to compile — `StartAsync`, `ExpireIfPastDeadlineAsync` etc. don't exist yet, and the `MakeWriter`/`Ctx` stubs throw `NotImplementedException`. Fix the stubs FIRST by literally copying `LiaSessionWriterTests.cs`'s private `MakeWriter()`/`Ctx()` method bodies (same file, same directory) before re-running — those two methods must be identical across every test class in this directory since they all share `LiaWriteDatabaseFixture`.

- [ ] **Step 4: Add `StartAsync` and the shared helpers to `LiaSessionWriter.cs`**

Add to `ILiaSessionWriter` in `LiaSessionWrite.cs`:

```csharp
Task<LiaStartOutcome> StartAsync(RequestContext context, string userId, string language, CancellationToken cancellationToken = default);
```

Add to `LiaSessionWriter.cs` (the existing class in `FormMaps.Infrastructure.Assessments`):

```csharp
private const string SelectActiveSessionsForUserSql = """
    SELECT s."id", s."status"::text AS "status", s."current_subtest"::text AS "currentSubtest",
           s."current_item" AS "currentItem", s."locked_at" AS "lockedAt",
           s."subtest_times"::text AS "subtestTimes", s."language"
    FROM "lia_assessment_sessions" s
    WHERE s."user_id" = @userId AND s."is_active" = true
    ORDER BY s."created_date" DESC
    """;

private const string IncrementReentrySql = """
    UPDATE "lia_assessment_sessions" SET "reentry_count" = "reentry_count" + 1
    WHERE "id" = @sessionId
    RETURNING "reentry_count"
    """;

private const string LockSessionSql = """
    UPDATE "lia_assessment_sessions" SET "locked_at" = @now, "flag_for_review" = true
    WHERE "id" = @sessionId AND "locked_at" IS NULL
    """;

private const string CreateSessionSql = """
    INSERT INTO "lia_assessment_sessions"
        ("id", "user_id", "status", "current_subtest", "current_item", "practice_completed",
         "subtest_times", "language", "updated_at")
    VALUES (@id, @userId, 'practice'::"LiaSessionStatus", @firstSubtest::"LiaSubtest", 0, @practiceCompleted::jsonb,
            '{}'::jsonb, @language, @now)
    """;

private const int MaxReentries = 3; // legacy MAX_REENTRIES (lib/proctoring.ts) — confirm exact value before shipping.

public async Task<LiaStartOutcome> StartAsync(
    RequestContext context, string userId, string language, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    // legacy checkAccess, inlined: find an existing active session for this user.
    ActiveSessionRow? existing = null;
    await using (var command = session.Connection.CreateCommand())
    {
        command.Transaction = session.Transaction;
        command.CommandText = SelectActiveSessionsForUserSql;
        AddParameter(command, "userId", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (await reader.ReadAsync(cancellationToken))
        {
            existing = ReadActiveSessionRow(reader);
        }
    }

    if (existing is { Status: "completed" })
    {
        return new LiaStartOutcome(LiaStartStatus.AlreadyCompleted, null);
    }

    if (existing is { Status: "practice" or "in_progress" } row)
    {
        if (row.LockedAt is not null)
        {
            return new LiaStartOutcome(LiaStartStatus.Locked, null);
        }

        if (row.Status == "practice")
        {
            // legacy: an interrupted practice phase resumes cleanly at its own practice questions.
            var currentSubtest = row.CurrentSubtest ?? LiaSubtestOrder.Order[0];
            return new LiaStartOutcome(LiaStartStatus.Started, new SessionStartPayload(
                row.Id, currentSubtest, LiaQuestionServing.FetchPracticeQuestions(currentSubtest, language)));
        }

        // status == "in_progress": Gate 1 (strike + lock), atomic.
        int reentryCount;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = IncrementReentrySql;
            AddParameter(command, "sessionId", row.Id);
            reentryCount = (int)(await command.ExecuteScalarAsync(cancellationToken))!;
        }

        if (reentryCount > MaxReentries)
        {
            await using (var command = session.Connection.CreateCommand())
            {
                command.Transaction = session.Transaction;
                command.CommandText = LockSessionSql;
                AddParameter(command, "sessionId", row.Id);
                AddTimestampParameter(command, "now", NowTruncated());
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await session.CommitAsync(cancellationToken);
            return new LiaStartOutcome(LiaStartStatus.Locked, null);
        }

        // Gate 2: expired clock -> shared timeout path.
        var expiry = await ExpireIfPastDeadlineAsync(session, row.Id, row.CurrentSubtest, row.SubtestTimes, cancellationToken);
        if (expiry is not null)
        {
            await session.CommitAsync(cancellationToken);
            if (expiry.AssessmentComplete)
            {
                return new LiaStartOutcome(LiaStartStatus.AlreadyCompleted, null);
            }

            return new LiaStartOutcome(LiaStartStatus.Started, new SessionStartPayload(
                row.Id, expiry.NextSubtest!, LiaQuestionServing.FetchPracticeQuestions(expiry.NextSubtest!, language),
                ResumeMode: "next_subtest"));
        }

        // Gate 3: resume in place, clock untouched.
        await session.CommitAsync(cancellationToken);
        var subtest = row.CurrentSubtest!;
        var startedAt = ReadSubtestStartedAt(row.SubtestTimes, subtest);
        return new LiaStartOutcome(LiaStartStatus.Started, new SessionStartPayload(
            row.Id, subtest, [], ResumeMode: "mid_subtest", CurrentItem: row.CurrentItem,
            StartedAt: startedAt, TimeLimitSeconds: LiaSubtestOrder.TimeSeconds[subtest],
            Questions: LiaQuestionServing.FetchAssessmentQuestions(subtest, language, LiaSubtestOrder.ItemCounts[subtest])));
    }

    // No existing session: fresh create.
    var newId = Guid.NewGuid().ToString();
    var firstSubtest = LiaSubtestOrder.Order[0];
    var practiceCompletedJson = JsonSerializer.Serialize(
        LiaSubtestOrder.Order.ToDictionary(s => s, _ => false), JsonOptions);
    await using (var command = session.Connection.CreateCommand())
    {
        command.Transaction = session.Transaction;
        command.CommandText = CreateSessionSql;
        AddParameter(command, "id", newId);
        AddParameter(command, "userId", userId);
        AddParameter(command, "firstSubtest", firstSubtest);
        AddParameter(command, "practiceCompleted", practiceCompletedJson);
        AddParameter(command, "language", language);
        AddTimestampParameter(command, "now", NowTruncated());
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    await session.CommitAsync(cancellationToken);
    return new LiaStartOutcome(LiaStartStatus.Started, new SessionStartPayload(
        newId, firstSubtest, LiaQuestionServing.FetchPracticeQuestions(firstSubtest, language)));
}

// legacy expireIfPastDeadline. Returns null if the subtest's clock has not expired.
private async Task<TimeoutAdvanceResult?> ExpireIfPastDeadlineAsync(
    IFormMapsWritableSession session, string sessionId, string? currentSubtest, string? subtestTimesJson,
    CancellationToken cancellationToken)
{
    if (currentSubtest is null)
    {
        return null;
    }

    var startedAt = ReadSubtestStartedAt(subtestTimesJson, currentSubtest);
    if (startedAt is null)
    {
        return null;
    }

    var deadline = DateTime.Parse(startedAt).ToUniversalTime()
        .AddSeconds(LiaSubtestOrder.TimeSeconds[currentSubtest])
        .AddMilliseconds(LiaSubtestOrder.TimerGraceMs);
    if (DateTime.UtcNow <= deadline)
    {
        return null;
    }

    return await ApplyTimeoutAsync(session, sessionId, currentSubtest, cancellationToken);
}

// legacy applyTimeout: fill every unanswered live item with a null response, then advance.
private async Task<TimeoutAdvanceResult> ApplyTimeoutAsync(
    IFormMapsWritableSession session, string sessionId, string subtest, CancellationToken cancellationToken)
{
    var itemCount = LiaSubtestOrder.ItemCounts[subtest];
    var served = LiaQuestionServing.FetchAssessmentQuestions(subtest, "es", itemCount); // language doesn't affect ids/coverage.

    var answeredIds = new HashSet<string>(StringComparer.Ordinal);
    await using (var command = session.Connection.CreateCommand())
    {
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT "question_id" FROM "lia_responses" WHERE "session_id" = @sessionId""";
        AddParameter(command, "sessionId", sessionId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            answeredIds.Add(reader.GetString(0));
        }
    }

    foreach (var q in served.Where(q => !answeredIds.Contains(q.Id)))
    {
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """
            INSERT INTO "lia_responses"
                ("id", "session_id", "question_id", "subtest", "item_number", "user_answer", "is_correct",
                 "answered_at", "time_spent_ms", "updated_at")
            VALUES (@id, @sessionId, @questionId, @subtest::"LiaSubtest", @itemNumber, NULL, NULL, @now, 0, @now)
            ON CONFLICT ("session_id", "question_id") DO NOTHING
            """;
        AddParameter(command, "id", Guid.NewGuid().ToString());
        AddParameter(command, "sessionId", sessionId);
        AddParameter(command, "questionId", q.Id);
        AddParameter(command, "subtest", subtest);
        AddParameter(command, "itemNumber", q.ItemNumber);
        AddTimestampParameter(command, "now", NowTruncated());
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    return await AdvancePastSubtestAsync(session, sessionId, subtest, cancellationToken);
}

// legacy advancePastSubtest (+ recordSubtestEnd folded in): stamp endedAt on the current subtest,
// then move to the next subtest's practice phase, or mark full assessment completion.
private async Task<TimeoutAdvanceResult> AdvancePastSubtestAsync(
    IFormMapsWritableSession session, string sessionId, string subtest, CancellationToken cancellationToken)
{
    var idx = LiaSubtestOrder.Order.ToList().IndexOf(subtest);
    var isLast = idx == LiaSubtestOrder.Order.Count - 1;
    var nextSubtest = isLast ? null : LiaSubtestOrder.Order[idx + 1];

    await using var command = session.Connection.CreateCommand();
    command.Transaction = session.Transaction;
    if (isLast)
    {
        command.CommandText = """
            UPDATE "lia_assessment_sessions"
            SET "subtest_times" = jsonb_set("subtest_times", ARRAY[@subtest, 'endedAt'], to_jsonb(@now::text))
            WHERE "id" = @sessionId
            """;
    }
    else
    {
        command.CommandText = """
            UPDATE "lia_assessment_sessions"
            SET "subtest_times" = jsonb_set("subtest_times", ARRAY[@subtest, 'endedAt'], to_jsonb(@now::text)),
                "current_subtest" = @nextSubtest::"LiaSubtest", "current_item" = 0,
                "status" = 'practice'::"LiaSessionStatus"
            WHERE "id" = @sessionId
            """;
        AddParameter(command, "nextSubtest", nextSubtest!);
    }

    AddParameter(command, "subtest", subtest);
    AddParameter(command, "sessionId", sessionId);
    AddParameter(command, "now", NowTruncated().ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
    await command.ExecuteNonQueryAsync(cancellationToken);

    return new TimeoutAdvanceResult(nextSubtest, isLast);
}

private static string? ReadSubtestStartedAt(string? subtestTimesJson, string subtest)
{
    if (string.IsNullOrEmpty(subtestTimesJson))
    {
        return null;
    }

    using var doc = JsonDocument.Parse(subtestTimesJson);
    return doc.RootElement.TryGetProperty(subtest, out var timing)
        && timing.TryGetProperty("startedAt", out var startedAt)
        ? startedAt.GetString()
        : null;
}

private static DateTime NowTruncated() =>
    TruncateToMilliseconds(DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified));

private static ActiveSessionRow ReadActiveSessionRow(DbDataReader reader) => new(
    Id: reader.GetString(reader.GetOrdinal("id")),
    Status: reader.GetString(reader.GetOrdinal("status")),
    CurrentSubtest: ReadNullableString(reader, "currentSubtest"),
    CurrentItem: reader.GetInt32(reader.GetOrdinal("currentItem")),
    LockedAt: ReadNullableDateTime(reader, "lockedAt"),
    SubtestTimes: ReadNullableString(reader, "subtestTimes"),
    Language: reader.GetString(reader.GetOrdinal("language")));

private sealed record ActiveSessionRow(
    string Id, string Status, string? CurrentSubtest, int CurrentItem, DateTime? LockedAt,
    string? SubtestTimes, string Language);
```

**Note**: `TimeoutAdvanceResult` needs a definition — add `public sealed record TimeoutAdvanceResult(string? NextSubtest, bool AssessmentComplete);` to `LiaSessionWrite.cs` alongside the other DTOs. `IFormMapsWritableSession` — use the actual interface name `databaseSessionFactory.OpenWritableAsync` returns (check `CompleteAsync`'s `session` local's type via its usage — it exposes `.Connection` and `.Transaction`; confirm the exact type name from `IFormMapsDatabaseSessionFactory`'s signature before compiling, the plan assumes it but the exact identifier must come from source, not this plan).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/api && dotnet test --filter LiaSessionStartTests`
Expected: PASS (6 tests). If `Concurrent_starts_on_the_same_session_count_every_strike_atomically` is flaky (intermittent lower count), the `FOR UPDATE`-equivalent serialization isn't actually happening — check that `IncrementReentrySql`'s single-statement `UPDATE...RETURNING` is really running inside a transaction that blocks concurrent writers on the same row (Postgres row-level locks make concurrent `UPDATE`s on the same row serialize automatically — if this test flakes, the most likely cause is the session factory not actually opening a real transaction per call, not a logic bug in the SQL itself).

- [ ] **Step 6: Commit**

```bash
git add services/api/src/FormMaps.Application/Assessments/LiaSessionWrite.cs \
        services/api/src/FormMaps.Infrastructure/Assessments/LiaSessionWriter.cs \
        services/api/tests/FormMaps.IntegrationTests/Assessments/LiaSessionStartTests.cs
git commit -m "feat(lia): port startSession (atomic reentry-lock + shared expiry/timeout helpers)"
```

---

### Task 4: `StartSubtestAsync` — one-shot clock guard

**Files:**
- Modify: `LiaSessionWrite.cs` (add `SubtestStartResult`, `LiaSubtestStartStatus`, `LiaSubtestStartOutcome`)
- Modify: `LiaSessionWriter.cs` (add `StartSubtestAsync`)
- Test: `services/api/tests/FormMaps.IntegrationTests/Assessments/LiaSubtestStartTests.cs`

**Interfaces:**
- Produces: `ILiaSessionWriter.StartSubtestAsync(RequestContext context, string sessionId, string ownerUserId, string subtest, CancellationToken ct): Task<LiaSubtestStartOutcome>`. `LiaSubtestStartStatus`: `Started`, `NotFound`, `PracticeIncomplete`, `AlreadyStarted`.

- [ ] **Step 1: Add DTOs**

```csharp
public sealed record SubtestStartResult(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("subtest")] string Subtest,
    [property: JsonPropertyName("questions")] IReadOnlyList<ClientQuestion> Questions,
    [property: JsonPropertyName("time_limit_seconds")] int TimeLimitSeconds,
    [property: JsonPropertyName("started_at")] string StartedAt);

public enum LiaSubtestStartStatus { Started, NotFound, PracticeIncomplete, AlreadyStarted }
public sealed record LiaSubtestStartOutcome(LiaSubtestStartStatus Status, SubtestStartResult? Result);
```

- [ ] **Step 2: Write the failing adversarial tests first**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Assessments/LiaSubtestStartTests.cs
// (class scaffold + Seed*/Read* helpers: same pattern as LiaSessionStartTests.cs — copy that file's
// MakeWriter/Ctx/SeedUserAsync verbatim, add a SeedSessionWithPracticeCompletedAsync helper below.)

[Fact]
public async Task Rejects_restarting_a_STILL_LIVE_subtest()
{
    var (userId, sessionId) = await SeedSessionWithPracticeCompletedAsync(
        subtest: "pattern_recognition", subtestStartedAt: DateTime.UtcNow.AddSeconds(-10));
    var (writer, _) = MakeWriter();

    var outcome = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

    Assert.Equal(LiaSubtestStartStatus.AlreadyStarted, outcome.Status);
}

[Fact]
public async Task Rejects_restarting_an_ALREADY_ENDED_subtest()
{
    // The bug Node's own fix initially missed: rejecting only the live case let an ENDED subtest
    // be restarted, rewinding state and destroying its endedAt/durationMs.
    var (userId, sessionId) = await SeedSessionWithPracticeCompletedAsync(
        subtest: "pattern_recognition", subtestStartedAt: DateTime.UtcNow.AddMinutes(-20), subtestEnded: true);
    var (writer, _) = MakeWriter();

    var outcome = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

    Assert.Equal(LiaSubtestStartStatus.AlreadyStarted, outcome.Status);
}

[Fact]
public async Task Starts_cleanly_when_practice_is_complete_and_the_subtest_never_started()
{
    var (userId, sessionId) = await SeedSessionWithPracticeCompletedAsync(subtest: "pattern_recognition");
    var (writer, _) = MakeWriter();

    var outcome = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

    Assert.Equal(LiaSubtestStartStatus.Started, outcome.Status);
    Assert.Equal(60, outcome.Result!.Questions.Count);
}

[Fact]
public async Task Rejects_when_practice_is_not_yet_marked_complete()
{
    var (userId, sessionId) = await SeedSessionWithPracticeCompletedAsync(subtest: "pattern_recognition", practiceComplete: false);
    var (writer, _) = MakeWriter();

    var outcome = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

    Assert.Equal(LiaSubtestStartStatus.PracticeIncomplete, outcome.Status);
}
```

Add the `SeedSessionWithPracticeCompletedAsync` helper (inserts a session row with `practice_completed` and optionally a `subtest_times` entry for the target subtest with/without `endedAt`, mirroring `SeedInProgressSessionAsync` from Task 3's test file).

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd services/api && dotnet test --filter LiaSubtestStartTests`
Expected: FAIL — `StartSubtestAsync` doesn't exist.

- [ ] **Step 4: Implement**

```csharp
// added to ILiaSessionWriter:
Task<LiaSubtestStartOutcome> StartSubtestAsync(RequestContext context, string sessionId, string ownerUserId, string subtest, CancellationToken cancellationToken = default);

// added to LiaSessionWriter:
private const string SelectSessionForSubtestStartSql = """
    SELECT "user_id" AS "userId", "practice_completed"::text AS "practiceCompleted",
           "subtest_times"::text AS "subtestTimes", "language", "started_at" AS "startedAt"
    FROM "lia_assessment_sessions" WHERE "id" = @sessionId
    """;

// One-shot guard AS A SQL PREDICATE: reject in the SAME statement that writes subtestTimes if the
// target subtest already has a startedAt, live or ended — stronger than Node's two-step
// read-then-conditional-write, since there's no window between the check and the write to race in.
private const string StartSubtestIfNeverStartedSql = """
    UPDATE "lia_assessment_sessions" SET
        "status" = 'in_progress'::"LiaSessionStatus",
        "current_subtest" = @subtest::"LiaSubtest",
        "current_item" = 1,
        "subtest_times" = jsonb_set("subtest_times", ARRAY[@subtest, 'startedAt'], to_jsonb(@startedAt::text)),
        "started_at" = COALESCE("started_at", @now)
    WHERE "id" = @sessionId
      AND NOT ("subtest_times" ? @subtest AND "subtest_times"->@subtest ? 'startedAt')
    """;

public async Task<LiaSubtestStartOutcome> StartSubtestAsync(
    RequestContext context, string sessionId, string ownerUserId, string subtest,
    CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    SubtestStartSessionRow row;
    await using (var command = session.Connection.CreateCommand())
    {
        command.Transaction = session.Transaction;
        command.CommandText = SelectSessionForSubtestStartSql;
        AddParameter(command, "sessionId", sessionId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new LiaSubtestStartOutcome(LiaSubtestStartStatus.NotFound, null);
        }

        row = new SubtestStartSessionRow(
            reader.GetString(reader.GetOrdinal("userId")),
            ReadNullableString(reader, "practiceCompleted"),
            ReadNullableString(reader, "subtestTimes"),
            reader.GetString(reader.GetOrdinal("language")),
            ReadNullableDateTime(reader, "startedAt"));
    }

    if (!string.Equals(row.UserId, ownerUserId, StringComparison.Ordinal))
    {
        return new LiaSubtestStartOutcome(LiaSubtestStartStatus.NotFound, null);
    }

    if (!IsPracticeCompleted(row.PracticeCompleted, subtest))
    {
        return new LiaSubtestStartOutcome(LiaSubtestStartStatus.PracticeIncomplete, null);
    }

    var startedAt = NowTruncated();
    int affected;
    await using (var command = session.Connection.CreateCommand())
    {
        command.Transaction = session.Transaction;
        command.CommandText = StartSubtestIfNeverStartedSql;
        AddParameter(command, "sessionId", sessionId);
        AddParameter(command, "subtest", subtest);
        AddParameter(command, "startedAt", startedAt.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
        AddTimestampParameter(command, "now", startedAt);
        affected = await command.ExecuteNonQueryAsync(cancellationToken);
    }

    if (affected == 0)
    {
        // The WHERE guard rejected: subtestTimes[subtest].startedAt already exists (live or ended).
        return new LiaSubtestStartOutcome(LiaSubtestStartStatus.AlreadyStarted, null);
    }

    await session.CommitAsync(cancellationToken);
    var itemCount = LiaSubtestOrder.ItemCounts[subtest];
    return new LiaSubtestStartOutcome(LiaSubtestStartStatus.Started, new SubtestStartResult(
        sessionId, subtest, LiaQuestionServing.FetchAssessmentQuestions(subtest, row.Language, itemCount),
        LiaSubtestOrder.TimeSeconds[subtest], startedAt.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")));
}

private static bool IsPracticeCompleted(string? practiceCompletedJson, string subtest)
{
    if (string.IsNullOrEmpty(practiceCompletedJson))
    {
        return false;
    }

    using var doc = JsonDocument.Parse(practiceCompletedJson);
    return doc.RootElement.TryGetProperty(subtest, out var value)
        && value.ValueKind == JsonValueKind.True;
}

private sealed record SubtestStartSessionRow(
    string UserId, string? PracticeCompleted, string? SubtestTimes, string Language, DateTime? StartedAt);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/api && dotnet test --filter LiaSubtestStartTests`
Expected: PASS (4 tests). The Postgres `jsonb ? key` containment operator used in the guard requires the parameter to bind as `text`/`varchar`, not an inferred type Npgsql might otherwise choose — if this errors with an operator-not-found message, explicitly set `parameter.NpgsqlDbType = NpgsqlDbType.Varchar` on the `@subtest` parameter in `StartSubtestIfNeverStartedSql`'s command (add a helper mirroring `AddTimestampParameter`'s pattern if needed).

- [ ] **Step 6: Commit**

```bash
git add services/api/src/FormMaps.Application/Assessments/LiaSessionWrite.cs \
        services/api/src/FormMaps.Infrastructure/Assessments/LiaSessionWriter.cs \
        services/api/tests/FormMaps.IntegrationTests/Assessments/LiaSubtestStartTests.cs
git commit -m "feat(lia): port startSubtest (one-shot clock guard as an atomic SQL predicate)"
```

---

### Task 5: `SubmitAnswerAsync` + `SubmitPracticeAnswerAsync`

**Files:**
- Modify: `LiaSessionWrite.cs` (add `AnswerResult`, `PracticeAnswerResult`, outcome types)
- Modify: `LiaSessionWriter.cs` (add both methods)
- Test: `services/api/tests/FormMaps.IntegrationTests/Assessments/LiaAnswerSubmitTests.cs`

**Interfaces:**
- Consumes: `ExpireIfPastDeadlineAsync` (Task 3), `LiaQuestionServing.FindAssessmentQuestion`/`FindById` (Task 2), `LiaAnswerScoring.IsAnswerCorrect`/`GetVerbalAnswerForLanguage`.
- Produces: `ILiaSessionWriter.SubmitAnswerAsync(RequestContext, string sessionId, string ownerUserId, string questionId, string? answer, int timeSpentMs, CancellationToken): Task<LiaSubmitAnswerOutcome>`. `ILiaSessionWriter.SubmitPracticeAnswerAsync(RequestContext, string sessionId, string ownerUserId, string questionId, string answer, CancellationToken): Task<LiaPracticeAnswerOutcome>`.

- [ ] **Step 1: Add DTOs**

```csharp
public sealed record AnswerResult(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("items_completed")] int ItemsCompleted,
    [property: JsonPropertyName("total_items")] int TotalItems,
    [property: JsonPropertyName("time_remaining_seconds")] int TimeRemainingSeconds,
    [property: JsonPropertyName("subtest_complete")] bool SubtestComplete,
    [property: JsonPropertyName("next_subtest")] string? NextSubtest,
    [property: JsonPropertyName("assessment_complete")] bool AssessmentComplete,
    [property: JsonPropertyName("completion")] LiaCompletionResult? Completion = null,
    [property: JsonPropertyName("timed_out")] bool? TimedOut = null,
    [property: JsonPropertyName("session_status")] string? SessionStatus = null);

public sealed record PracticeAnswerResult(
    [property: JsonPropertyName("is_correct")] bool IsCorrect,
    [property: JsonPropertyName("correct_answer")] string CorrectAnswer,
    [property: JsonPropertyName("practice_complete")] bool PracticeComplete,
    [property: JsonPropertyName("next_question")] ClientQuestion? NextQuestion);

public enum LiaSubmitAnswerStatus { Ok, NotFound, NotInProgress, QuestionNotFound }
public sealed record LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus Status, AnswerResult? Result);

public enum LiaPracticeAnswerStatus { Ok, NotFound, NotInPractice, QuestionNotFound }
public sealed record LiaPracticeAnswerOutcome(LiaPracticeAnswerStatus Status, PracticeAnswerResult? Result);
```

- [ ] **Step 2: Write failing tests (replay-block + expiry-reject first)**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Assessments/LiaAnswerSubmitTests.cs

[Fact]
public async Task Resubmitting_an_already_answered_item_updates_the_response_but_does_not_advance()
{
    var (userId, sessionId) = await SeedInProgressWithOneAnsweredAsync(subtest: "pattern_recognition", questionId: "pattern_recognition:1:assessment");
    var (writer, _) = MakeWriter();

    var outcome = await writer.SubmitAnswerAsync(Ctx(userId), sessionId, userId, "pattern_recognition:1:assessment", "X", 500);

    Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
    Assert.Equal(1, outcome.Result!.ItemsCompleted); // unchanged — the resubmit must not increment currentItem.
}

[Fact]
public async Task Submitting_past_the_deadline_times_out_instead_of_persisting_the_answer()
{
    var (userId, sessionId) = await SeedInProgressSessionExpiredAsync(subtest: "pattern_recognition");
    var (writer, _) = MakeWriter();

    var outcome = await writer.SubmitAnswerAsync(Ctx(userId), sessionId, userId, "pattern_recognition:1:assessment", "A", 100);

    Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
    Assert.True(outcome.Result!.TimedOut);
    // The late answer must NOT be persisted as a real response.
    Assert.False(await ResponseExistsAsync(sessionId, "pattern_recognition:1:assessment", withRealAnswer: true));
}

[Fact]
public async Task Practice_answer_reports_correctness_and_serves_the_next_practice_question()
{
    var (userId, sessionId) = await SeedPracticePhaseSessionAsync(subtest: "pattern_recognition");
    var (writer, _) = MakeWriter();

    var outcome = await writer.SubmitPracticeAnswerAsync(Ctx(userId), sessionId, userId, "pattern_recognition:1:practice", "0");

    Assert.Equal(LiaPracticeAnswerStatus.Ok, outcome.Status);
    Assert.NotNull(outcome.Result);
}
```

(`SeedInProgressWithOneAnsweredAsync`, `SeedInProgressSessionExpiredAsync`, `SeedPracticePhaseSessionAsync`, `ResponseExistsAsync` — new helpers following the exact insert/read pattern established in Tasks 3-4's test files; each seeds the minimum row shape `submitAnswer`/`submitPracticeAnswer` reads.)

- [ ] **Step 3: Run to verify failure, then implement**

Run: `cd services/api && dotnet test --filter LiaAnswerSubmitTests` — expect FAIL (methods don't exist).

```csharp
// added to LiaSessionWriter:
private const string SelectSessionForAnswerSql = """
    SELECT "user_id" AS "userId", "status"::text AS "status", "current_subtest"::text AS "currentSubtest",
           "current_item" AS "currentItem", "subtest_times"::text AS "subtestTimes", "language"
    FROM "lia_assessment_sessions" WHERE "id" = @sessionId
    """;

public async Task<LiaSubmitAnswerOutcome> SubmitAnswerAsync(
    RequestContext context, string sessionId, string ownerUserId, string questionId, string? answer,
    int timeSpentMs, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    AnswerSessionRow row;
    await using (var command = session.Connection.CreateCommand())
    {
        command.Transaction = session.Transaction;
        command.CommandText = SelectSessionForAnswerSql;
        AddParameter(command, "sessionId", sessionId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.NotFound, null);
        }

        row = new AnswerSessionRow(
            reader.GetString(reader.GetOrdinal("userId")), reader.GetString(reader.GetOrdinal("status")),
            ReadNullableString(reader, "currentSubtest"), reader.GetInt32(reader.GetOrdinal("currentItem")),
            ReadNullableString(reader, "subtestTimes"), reader.GetString(reader.GetOrdinal("language")));
    }

    if (!string.Equals(row.UserId, ownerUserId, StringComparison.Ordinal))
    {
        return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.NotFound, null);
    }

    if (row.Status != "in_progress")
    {
        return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.NotInProgress, null);
    }

    var currentSubtest = row.CurrentSubtest!;
    var itemCount = LiaSubtestOrder.ItemCounts[currentSubtest];

    var expiry = await ExpireIfPastDeadlineAsync(session, sessionId, currentSubtest, row.SubtestTimes, cancellationToken);
    if (expiry is not null)
    {
        await session.CommitAsync(cancellationToken);
        return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.Ok, new AnswerResult(
            sessionId, itemCount, itemCount, 0, true, expiry.NextSubtest, expiry.AssessmentComplete,
            TimedOut: true, SessionStatus: expiry.AssessmentComplete ? "completed" : "practice"));
    }

    var question = LiaQuestionServing.FindById(questionId);
    if (question is null || question.Subtest != currentSubtest || question.IsPractice)
    {
        return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.QuestionNotFound, null);
    }

    var effectiveAnswer = currentSubtest == "verbal_reasoning"
        ? LiaAnswerScoring.GetVerbalAnswerForLanguage(question.CorrectAnswer, question.ItemNumber, isPractice: false, row.Language)
        : question.CorrectAnswer;
    bool? isCorrect = answer is null ? null : LiaAnswerScoring.IsAnswerCorrect(currentSubtest, answer, effectiveAnswer);

    bool alreadyAnswered;
    await using (var command = session.Connection.CreateCommand())
    {
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT 1 FROM "lia_responses" WHERE "session_id" = @sessionId AND "question_id" = @questionId""";
        AddParameter(command, "sessionId", sessionId);
        AddParameter(command, "questionId", questionId);
        alreadyAnswered = await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    await using (var command = session.Connection.CreateCommand())
    {
        command.Transaction = session.Transaction;
        command.CommandText = """
            INSERT INTO "lia_responses"
                ("id", "session_id", "question_id", "subtest", "item_number", "user_answer", "is_correct",
                 "answered_at", "time_spent_ms", "updated_at")
            VALUES (@id, @sessionId, @questionId, @subtest::"LiaSubtest", @itemNumber, @answer, @isCorrect, @now, @timeSpentMs, @now)
            ON CONFLICT ("session_id", "question_id") DO UPDATE SET
                "user_answer" = @answer, "is_correct" = @isCorrect, "answered_at" = @now, "time_spent_ms" = @timeSpentMs
            """;
        AddParameter(command, "id", Guid.NewGuid().ToString());
        AddParameter(command, "sessionId", sessionId);
        AddParameter(command, "questionId", questionId);
        AddParameter(command, "subtest", currentSubtest);
        AddParameter(command, "itemNumber", question.ItemNumber);
        AddParameter(command, "answer", (object?)answer ?? DBNull.Value);
        AddParameter(command, "isCorrect", (object?)isCorrect ?? DBNull.Value);
        AddTimestampParameter(command, "now", NowTruncated());
        AddParameter(command, "timeSpentMs", timeSpentMs);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    var newCurrentItem = alreadyAnswered ? row.CurrentItem : row.CurrentItem + 1;
    if (!alreadyAnswered)
    {
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """UPDATE "lia_assessment_sessions" SET "current_item" = @item WHERE "id" = @sessionId""";
        AddParameter(command, "item", newCurrentItem);
        AddParameter(command, "sessionId", sessionId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    var subtestComplete = newCurrentItem > itemCount;
    var startedAt = ReadSubtestStartedAt(row.SubtestTimes, currentSubtest);
    var elapsedSeconds = startedAt is null ? 0 : (DateTime.UtcNow - DateTime.Parse(startedAt).ToUniversalTime()).TotalSeconds;
    var timeRemaining = Math.Max(0, LiaSubtestOrder.TimeSeconds[currentSubtest] - elapsedSeconds);

    string? nextSubtest = null;
    var assessmentComplete = false;
    if (subtestComplete)
    {
        var advanced = await AdvancePastSubtestAsync(session, sessionId, currentSubtest, cancellationToken);
        nextSubtest = advanced.NextSubtest;
        assessmentComplete = advanced.AssessmentComplete;
    }

    await session.CommitAsync(cancellationToken);
    return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.Ok, new AnswerResult(
        sessionId, newCurrentItem - 1, itemCount, (int)Math.Round(timeRemaining), subtestComplete, nextSubtest,
        assessmentComplete));
}

public async Task<LiaPracticeAnswerOutcome> SubmitPracticeAnswerAsync(
    RequestContext context, string sessionId, string ownerUserId, string questionId, string answer,
    CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    string userId;
    string status;
    string? practiceCompletedJson;
    string language;
    await using (var command = session.Connection.CreateCommand())
    {
        command.Transaction = session.Transaction;
        command.CommandText = """
            SELECT "user_id", "status"::text, "practice_completed"::text, "language"
            FROM "lia_assessment_sessions" WHERE "id" = @sessionId
            """;
        AddParameter(command, "sessionId", sessionId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new LiaPracticeAnswerOutcome(LiaPracticeAnswerStatus.NotFound, null);
        }

        userId = reader.GetString(0);
        status = reader.GetString(1);
        practiceCompletedJson = reader.IsDBNull(2) ? null : reader.GetString(2);
        language = reader.GetString(3);
    }

    if (!string.Equals(userId, ownerUserId, StringComparison.Ordinal))
    {
        return new LiaPracticeAnswerOutcome(LiaPracticeAnswerStatus.NotFound, null);
    }

    if (status != "practice")
    {
        return new LiaPracticeAnswerOutcome(LiaPracticeAnswerStatus.NotInPractice, null);
    }

    var question = LiaQuestionServing.FindById(questionId);
    if (question is null)
    {
        return new LiaPracticeAnswerOutcome(LiaPracticeAnswerStatus.QuestionNotFound, null);
    }

    var effectiveAnswer = question.Subtest == "verbal_reasoning"
        ? LiaAnswerScoring.GetVerbalAnswerForLanguage(question.CorrectAnswer, question.ItemNumber, isPractice: true, language)
        : question.CorrectAnswer;
    var isCorrect = LiaAnswerScoring.IsAnswerCorrect(question.Subtest, answer, effectiveAnswer);

    var practiceItems = LiaQuestionServing.FetchPracticeQuestions(question.Subtest, language);
    var next = practiceItems.FirstOrDefault(q => q.ItemNumber > question.ItemNumber);
    var practiceComplete = next is null;

    if (practiceComplete)
    {
        var updated = MergePracticeCompleted(practiceCompletedJson, question.Subtest);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """UPDATE "lia_assessment_sessions" SET "practice_completed" = @pc::jsonb WHERE "id" = @sessionId""";
        AddParameter(command, "pc", updated);
        AddParameter(command, "sessionId", sessionId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    await session.CommitAsync(cancellationToken);
    return new LiaPracticeAnswerOutcome(LiaPracticeAnswerStatus.Ok, new PracticeAnswerResult(
        isCorrect, effectiveAnswer, practiceComplete, next));
}

private static string MergePracticeCompleted(string? existingJson, string subtest)
{
    var dict = string.IsNullOrEmpty(existingJson)
        ? new Dictionary<string, bool>(StringComparer.Ordinal)
        : JsonSerializer.Deserialize<Dictionary<string, bool>>(existingJson, JsonOptions)!;
    dict[subtest] = true;
    return JsonSerializer.Serialize(dict, JsonOptions);
}

private sealed record AnswerSessionRow(
    string UserId, string Status, string? CurrentSubtest, int CurrentItem, string? SubtestTimes, string Language);
```

- [ ] **Step 4: Run to verify pass**

Run: `cd services/api && dotnet test --filter LiaAnswerSubmitTests`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add services/api/src/FormMaps.Application/Assessments/LiaSessionWrite.cs \
        services/api/src/FormMaps.Infrastructure/Assessments/LiaSessionWriter.cs \
        services/api/tests/FormMaps.IntegrationTests/Assessments/LiaAnswerSubmitTests.cs
git commit -m "feat(lia): port submitAnswer + submitPracticeAnswer"
```

---

### Task 6: `HandleTimeoutAsync` + `SaveViolationsAsync`

**Files:**
- Modify: `LiaSessionWrite.cs`, `LiaSessionWriter.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Assessments/LiaTimeoutViolationsTests.cs`

**Interfaces:**
- Produces: `ILiaSessionWriter.HandleTimeoutAsync(RequestContext, string sessionId, string ownerUserId, string subtest, CancellationToken): Task<LiaSubmitAnswerOutcome>` (reuses `AnswerResult`/`LiaSubmitAnswerStatus` from Task 5 — same response shape as legacy `handleTimeout`, which returns the same `AnswerResult` type). `ILiaSessionWriter.SaveViolationsAsync(RequestContext, string sessionId, string ownerUserId, IReadOnlyList<ViolationEntry>, CancellationToken): Task<LiaSaveViolationsOutcome>`.

- [ ] **Step 1: Add DTOs**

```csharp
public sealed record ViolationEntry(string Type, string Timestamp, string Details);
public enum LiaSaveViolationsStatus { Ok, NotFound }
public sealed record LiaSaveViolationsOutcome(LiaSaveViolationsStatus Status, int SavedCount);
```

- [ ] **Step 2: Write failing tests**

```csharp
[Fact]
public async Task Timeout_fills_unanswered_items_and_advances_the_subtest()
{
    var (userId, sessionId) = await SeedInProgressSessionExpiredAsync(subtest: "pattern_recognition"); // reuse from Task 5's test file, or duplicate here
    var (writer, _) = MakeWriter();

    var outcome = await writer.HandleTimeoutAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

    Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
    Assert.True(outcome.Result!.SubtestComplete);
}

[Fact]
public async Task Saving_violations_appends_and_flags_for_review_past_the_threshold()
{
    var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0); // from Task 3's file
    var (writer, _) = MakeWriter();
    var violations = Enumerable.Range(0, 5)
        .Select(i => new ViolationEntry("fullscreen_exit", DateTime.UtcNow.ToString("o"), $"violation {i}"))
        .ToList();

    var outcome = await writer.SaveViolationsAsync(Ctx(userId), sessionId, userId, violations);

    Assert.Equal(LiaSaveViolationsStatus.Ok, outcome.Status);
    Assert.Equal(5, outcome.SavedCount);
}
```

- [ ] **Step 3: Run to verify failure, then implement**

```csharp
// added to ILiaSessionWriter:
Task<LiaSubmitAnswerOutcome> HandleTimeoutAsync(RequestContext context, string sessionId, string ownerUserId, string subtest, CancellationToken cancellationToken = default);
Task<LiaSaveViolationsOutcome> SaveViolationsAsync(RequestContext context, string sessionId, string ownerUserId, IReadOnlyList<ViolationEntry> violations, CancellationToken cancellationToken = default);

// added to LiaSessionWriter:
public async Task<LiaSubmitAnswerOutcome> HandleTimeoutAsync(
    RequestContext context, string sessionId, string ownerUserId, string subtest,
    CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    string userId, status, currentSubtest;
    await using (var command = session.Connection.CreateCommand())
    {
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT "user_id", "status"::text, "current_subtest"::text FROM "lia_assessment_sessions" WHERE "id" = @sessionId""";
        AddParameter(command, "sessionId", sessionId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.NotFound, null);
        }

        userId = reader.GetString(0);
        status = reader.GetString(1);
        currentSubtest = reader.IsDBNull(2) ? "" : reader.GetString(2);
    }

    if (!string.Equals(userId, ownerUserId, StringComparison.Ordinal) || status != "in_progress" || currentSubtest != subtest)
    {
        return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.NotInProgress, null);
    }

    var itemCount = LiaSubtestOrder.ItemCounts[subtest];
    var advanced = await ApplyTimeoutAsync(session, sessionId, subtest, cancellationToken);
    await session.CommitAsync(cancellationToken);

    return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.Ok, new AnswerResult(
        sessionId, itemCount, itemCount, 0, true, advanced.NextSubtest, advanced.AssessmentComplete));
}

public async Task<LiaSaveViolationsOutcome> SaveViolationsAsync(
    RequestContext context, string sessionId, string ownerUserId, IReadOnlyList<ViolationEntry> violations,
    CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    string userId;
    string? existingJson;
    await using (var command = session.Connection.CreateCommand())
    {
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT "user_id", "lockdown_violations"::text FROM "lia_assessment_sessions" WHERE "id" = @sessionId""";
        AddParameter(command, "sessionId", sessionId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new LiaSaveViolationsOutcome(LiaSaveViolationsStatus.NotFound, 0);
        }

        userId = reader.GetString(0);
        existingJson = reader.IsDBNull(1) ? null : reader.GetString(1);
    }

    if (!string.Equals(userId, ownerUserId, StringComparison.Ordinal))
    {
        return new LiaSaveViolationsOutcome(LiaSaveViolationsStatus.NotFound, 0);
    }

    const int proctoringFlagThreshold = 3; // legacy PROCTORING_FLAG_THRESHOLD (lib/proctoring.ts) — confirm before shipping.
    var existing = string.IsNullOrEmpty(existingJson)
        ? new List<ViolationEntry>()
        : JsonSerializer.Deserialize<List<ViolationEntry>>(existingJson, JsonOptions)!;
    var all = existing.Concat(violations).Take(500).ToList();
    var flag = all.Count >= proctoringFlagThreshold;

    await using (var command = session.Connection.CreateCommand())
    {
        command.Transaction = session.Transaction;
        command.CommandText = """
            UPDATE "lia_assessment_sessions" SET "lockdown_violations" = @all::jsonb, "flag_for_review" = @flag
            WHERE "id" = @sessionId
            """;
        AddParameter(command, "all", JsonSerializer.Serialize(all, JsonOptions));
        AddParameter(command, "flag", flag);
        AddParameter(command, "sessionId", sessionId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    await session.CommitAsync(cancellationToken);
    return new LiaSaveViolationsOutcome(LiaSaveViolationsStatus.Ok, violations.Count);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd services/api && dotnet test --filter LiaTimeoutViolationsTests`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add services/api/src/FormMaps.Application/Assessments/LiaSessionWrite.cs \
        services/api/src/FormMaps.Infrastructure/Assessments/LiaSessionWriter.cs \
        services/api/tests/FormMaps.IntegrationTests/Assessments/LiaTimeoutViolationsTests.cs
git commit -m "feat(lia): port handleTimeout + saveViolations"
```

---

### Task 7: Reads — `GetAccessAsync`, `GetSessionAsync`, `GetPracticeQuestionsAsync`

**Files:**
- Create: `services/api/src/FormMaps.Application/Assessments/ILiaSessionReader.cs`
- Create: `services/api/src/FormMaps.Infrastructure/Assessments/LiaSessionReader.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Assessments/LiaSessionReaderTests.cs`

**Interfaces:**
- Consumes: `ExpireIfPastDeadlineAsync`/`ApplyTimeoutAsync`/`AdvancePastSubtestAsync` — these are currently `private` on `LiaSessionWriter` (Task 3). Make them `internal` (not `public`, to keep the writer's surface area intentional) so `LiaSessionReader` in the same assembly can call them, OR duplicate the lazy-expiry check as a read-only variant that opens a writable session only when an actual expiry-write is needed (recommended — a GET that always opens a writable transaction even when nothing expires is heavier than necessary). This task uses the second approach: `LiaSessionReader` takes `ILiaSessionWriter` as a constructor dependency and delegates to it only when `GetSessionAsync`'s read detects a stale deadline.
- Produces: `ILiaSessionReader.GetAccessAsync(RequestContext, string userId, CancellationToken): Task<CheckAccessResult>`, `.GetSessionAsync(RequestContext, string sessionId, string ownerUserId, CancellationToken): Task<SessionDetail?>`, `.GetPracticeQuestionsAsync(RequestContext, string sessionId, string ownerUserId, CancellationToken): Task<IReadOnlyList<ClientQuestion>?>` (null = not found/not owned).

- [ ] **Step 1: Add DTOs**

```csharp
// LiaSessionWrite.cs
public sealed record CheckAccessResult(
    [property: JsonPropertyName("has_access")] bool HasAccess,
    [property: JsonPropertyName("has_completed")] bool HasCompleted,
    [property: JsonPropertyName("existing_session_id")] string? ExistingSessionId = null,
    [property: JsonPropertyName("reason")] string? Reason = null,
    [property: JsonPropertyName("locked")] bool? Locked = null);

public sealed record SessionDetail(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("current_subtest")] string? CurrentSubtest,
    [property: JsonPropertyName("current_item")] int CurrentItem,
    [property: JsonPropertyName("practice_completed")] JsonElement PracticeCompleted,
    [property: JsonPropertyName("subtest_times")] JsonElement SubtestTimes,
    [property: JsonPropertyName("language")] string Language,
    [property: JsonPropertyName("started_at")] DateTime? StartedAt,
    [property: JsonPropertyName("completed_at")] DateTime? CompletedAt);
```

```csharp
// ILiaSessionReader.cs
namespace FormMaps.Application.Assessments;

public interface ILiaSessionReader
{
    Task<CheckAccessResult> GetAccessAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
    Task<SessionDetail?> GetSessionAsync(RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ClientQuestion>?> GetPracticeQuestionsAsync(RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default);
}
```

- [ ] **Step 2: Write failing tests**

```csharp
[Fact]
public async Task Access_reports_locked_true_for_a_locked_in_progress_session()
{
    var (userId, _) = await SeedLockedSessionAsync(); // reuse Task 3's helper
    var (_, reader) = MakeReaderAndWriter();

    var access = await reader.GetAccessAsync(Ctx(userId), userId);

    Assert.True(access.HasAccess);
    Assert.True(access.Locked);
}

[Fact]
public async Task Get_session_lazily_applies_expiry_before_returning()
{
    var (userId, sessionId) = await SeedInProgressSessionExpiredAsync(subtest: "pattern_recognition");
    var (_, reader) = MakeReaderAndWriter();

    var detail = await reader.GetSessionAsync(Ctx(userId), sessionId, userId);

    Assert.NotNull(detail);
    Assert.NotEqual("pattern_recognition", detail!.CurrentSubtest); // advanced past the expired subtest.
}
```

- [ ] **Step 3: Implement `LiaSessionReader`**

```csharp
// services/api/src/FormMaps.Infrastructure/Assessments/LiaSessionReader.cs
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

public sealed class LiaSessionReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ILiaSessionReader
{
    public async Task<CheckAccessResult> GetAccessAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.CommandText = """
            SELECT "id", "status"::text, "locked_at" FROM "lia_assessment_sessions"
            WHERE "user_id" = @userId AND "is_active" = true ORDER BY "created_date" DESC
            """;
        var p = command.CreateParameter(); p.ParameterName = "userId"; p.Value = userId; command.Parameters.Add(p);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            var status = reader.GetString(1);
            if (status == "completed")
            {
                return new CheckAccessResult(false, true, reader.GetString(0), "already_completed");
            }

            if (status is "in_progress" or "practice")
            {
                return new CheckAccessResult(true, false, reader.GetString(0), Locked: !reader.IsDBNull(2));
            }
        }

        return new CheckAccessResult(true, false);
    }

    public async Task<SessionDetail?> GetSessionAsync(
        RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default)
    {
        // Lazy expiry may need a write; delegate the whole read to the writer's connection if the current
        // subtest's deadline has passed. Simplest correct approach: always call through a tiny writer-side
        // read-then-maybe-expire method. See Task 3's ExpireIfPastDeadlineAsync — expose a public wrapper
        // on ILiaSessionWriter for this exact purpose:
        //   Task<SessionDetail?> ILiaSessionWriter.ReadWithLazyExpiryAsync(...)
        // Add that method to LiaSessionWriter (Task 3's class) delegating to the existing private read +
        // ExpireIfPastDeadlineAsync, then have THIS reader call it. This keeps exactly one code path that
        // knows how to lazily expire a session, instead of duplicating the SELECT here.
        throw new NotImplementedException(
            "wire to ILiaSessionWriter.ReadWithLazyExpiryAsync once added to LiaSessionWriter per the note above");
    }

    public async Task<IReadOnlyList<ClientQuestion>?> GetPracticeQuestionsAsync(
        RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.CommandText = """
            SELECT "user_id", "current_subtest"::text, "language" FROM "lia_assessment_sessions"
            WHERE "id" = @sessionId AND "is_active" = true
            """;
        var p = command.CreateParameter(); p.ParameterName = "sessionId"; p.Value = sessionId; command.Parameters.Add(p);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken) || reader.GetString(0) != ownerUserId)
        {
            return null;
        }

        var subtest = reader.IsDBNull(1) ? LiaSubtestOrder.Order[0] : reader.GetString(1);
        return LiaQuestionServing.FetchPracticeQuestions(subtest, reader.GetString(2));
    }
}
```

**Required follow-up inside this task**: add `Task<SessionDetail?> ReadWithLazyExpiryAsync(RequestContext, string sessionId, string ownerUserId, CancellationToken)` to `ILiaSessionWriter`/`LiaSessionWriter` (Task 3's class) — implementation: run the same ownership-checked SELECT `CompleteAsync` uses as a template, call the existing private `ExpireIfPastDeadlineAsync` if the row is `in_progress`, then return the (possibly now-refreshed) row mapped to `SessionDetail`. This keeps the lazy-expiry logic in exactly one place (the writer) rather than duplicating it in the reader, matching Node's own design (`getSession` calls the shared `expireIfPastDeadline`, same function `submitAnswer`/`startSession` call).

- [ ] **Step 4: Wire `GetSessionAsync` through the new writer method, run tests, verify pass**

Run: `cd services/api && dotnet test --filter LiaSessionReaderTests`
Expected: PASS (2 tests) once Step 3's follow-up lands.

- [ ] **Step 5: Register `ILiaSessionReader` in DI**

Find where `ILiaSessionWriter` is registered (likely `Program.cs` or a DI extension method — `grep -rn "ILiaSessionWriter," services/api/src/FormMaps.Api` to find the exact registration line) and add `services.AddScoped<ILiaSessionReader, LiaSessionReader>();` immediately after it, matching whatever lifetime `ILiaSessionWriter` uses.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/FormMaps.Application/Assessments/ILiaSessionReader.cs \
        services/api/src/FormMaps.Application/Assessments/LiaSessionWrite.cs \
        services/api/src/FormMaps.Infrastructure/Assessments/LiaSessionReader.cs \
        services/api/src/FormMaps.Infrastructure/Assessments/LiaSessionWriter.cs \
        services/api/tests/FormMaps.IntegrationTests/Assessments/LiaSessionReaderTests.cs
git commit -m "feat(lia): port checkAccess/getSession/getPracticeQuestions reads (shared lazy-expiry)"
```

---

### Task 8: Endpoints — all 10 routes

**Files:**
- Modify: `services/api/src/FormMaps.Api/Endpoints/LiaEndpoints.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Assessments/LiaSessionEndpointsTests.cs`

**Interfaces:**
- Consumes: every writer/reader method from Tasks 3-7.

- [ ] **Step 1: Write failing endpoint tests for the error-mapping contract**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Assessments/LiaSessionEndpointsTests.cs
// Follow LiaCompleteEndpointTests.cs's exact pattern (WebApplicationFactory-style host, real HTTP calls).

[Fact]
public async Task Locked_session_start_returns_409_with_the_session_locked_error_code()
{
    // seed a locked session, call POST /api/v1/lia/start as its owner, assert:
    //   status 409, body {"success":false,"error":"session_locked","message":"..."}
}

[Fact]
public async Task Subtest_already_started_returns_409_with_the_subtest_already_started_error_code()
{
    // status 409, body {"success":false,"error":"subtest_already_started","message":"Subtest already started"}
}

[Fact]
public async Task Anonymous_calls_to_every_new_route_return_401()
{
    // loop all 10 routes (7 POST + access/session/practice GETs), assert 401 for each with no auth header.
}
```

- [ ] **Step 2: Add the routes**

Add to `LiaEndpoints.MapLiaEndpoints`, before the existing `group.MapPost("/session/{sessionId}/complete", ...)` line:

```csharp
group.MapGet("/access", GetAccessAsync);
group.MapPost("/start", StartAsync);
group.MapGet("/session/{sessionId}", GetSessionAsync);
group.MapGet("/session/{sessionId}/practice", GetPracticeQuestionsAsync);
group.MapPost("/session/{sessionId}/practice/answer", SubmitPracticeAnswerAsync);
group.MapPost("/session/{sessionId}/subtest/start", StartSubtestAsync);
group.MapPost("/session/{sessionId}/answer", SubmitAnswerAsync);
group.MapPost("/session/{sessionId}/timeout", HandleTimeoutAsync);
group.MapPost("/session/{sessionId}/violations", SaveViolationsAsync);
```

Then add the handler methods (error mapping copied EXACTLY from legacy `handleError` in `lia.ts`):

```csharp
private static async Task<IResult> StartAsync(
    IRequestContextAccessor requestContextAccessor, IProtectedRequestGuard protectedRequestGuard,
    ISubscriptionGuard subscriptionGuard, ILiaSessionWriter writer, StartRequest? body, CancellationToken cancellationToken)
{
    var context = requestContextAccessor.Current;
    var identity = protectedRequestGuard.RequireIdentity(context);
    if (!identity.Allowed) return Deny(identity);
    var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
    if (!subscription.Allowed) return Deny(subscription);

    var language = body?.Language == "en" ? "en" : "es";
    var outcome = await writer.StartAsync(context, context.Tenant!.UserId, language, cancellationToken);
    return outcome.Status switch
    {
        LiaStartStatus.Started => Results.Ok(new { success = true, data = outcome.Payload }),
        LiaStartStatus.Locked => Error(409, "session_locked",
            "Assessment locked after too many exits — ask your school administrator to unlock it"),
        _ => Error(409, null, "Assessment already completed"), // AlreadyCompleted
    };
}

private static async Task<IResult> StartSubtestAsync(
    IRequestContextAccessor requestContextAccessor, IProtectedRequestGuard protectedRequestGuard,
    ISubscriptionGuard subscriptionGuard, ILiaSessionWriter writer, string sessionId, SubtestStartRequest body,
    CancellationToken cancellationToken)
{
    var context = requestContextAccessor.Current;
    var identity = protectedRequestGuard.RequireIdentity(context);
    if (!identity.Allowed) return Deny(identity);
    var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
    if (!subscription.Allowed) return Deny(subscription);

    if (!LiaSubtestOrder.Order.Contains(body.Subtest))
    {
        return Results.Json(new { success = false, message = "Invalid subtest" }, statusCode: 400);
    }

    var outcome = await writer.StartSubtestAsync(context, sessionId, context.Tenant!.UserId, body.Subtest, cancellationToken);
    return outcome.Status switch
    {
        LiaSubtestStartStatus.Started => Results.Ok(new { success = true, data = outcome.Result }),
        LiaSubtestStartStatus.PracticeIncomplete => Results.Json(new { success = false, message = "practice_incomplete" }, statusCode: 400),
        LiaSubtestStartStatus.AlreadyStarted => Error(409, "subtest_already_started", "Subtest already started"),
        _ => NotFound(),
    };
}

// SubmitAnswerAsync, SubmitPracticeAnswerAsync, HandleTimeoutAsync, SaveViolationsAsync, GetAccessAsync,
// GetSessionAsync, GetPracticeQuestionsAsync: same shape as CompleteSessionAsync/GetSessionResultsAsync
// already in this file — identity -> subscription -> call writer/reader -> map outcome to the exact
// legacy status/body pairs from handleError (400 "not_in_progress", 400 "question_id and answer are
// required" for missing body fields, 404 uniform NotFound for ownership/not-found). Implement each
// following that established 3-guard-then-switch shape; do not invent new status codes not present in
// the legacy handleError function.

private static IResult Error(int statusCode, string? errorCode, string message) =>
    Results.Json(
        errorCode is null ? new { success = false, message } : new { success = false, error = errorCode, message },
        statusCode: statusCode);

public sealed record StartRequest(string? Language);
public sealed record SubtestStartRequest(string Subtest);
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd services/api && dotnet test --filter LiaSessionEndpointsTests`
Expected: PASS.

- [ ] **Step 4: Full solution build + test run**

```bash
cd services/api
dotnet build FormMaps.slnx
dotnet test FormMaps.slnx
```
Expected: 0 errors, all tests green (including every pre-existing Lia/Assessments test — this task must not regress `LiaCompleteEndpointTests`, `LiaResultsEndpointsTests`, or any unit test).

- [ ] **Step 5: Commit + push**

```bash
git add services/api/src/FormMaps.Api/Endpoints/LiaEndpoints.cs \
        services/api/tests/FormMaps.IntegrationTests/Assessments/LiaSessionEndpointsTests.cs
git commit -m "feat(migration): FM-DOTNET-029 LIA session write lifecycle — all 10 routes (start/answer/timeout/subtest/practice/violations/complete + 3 reads)"
git push origin main
```

---

### Task 9: Frontend wire-up (dark)

**Files:**
- Modify: `formmaps-platform/frontend/next.config.ts`

**Interfaces:**
- Produces: `shouldRouteLiaSessionToDotnet()` gating all 10 routes under `FORMMAPS_ROUTE_LIA_SESSION_TO_DOTNET`.

- [ ] **Step 1: Add the flag function**

Find the existing LIA-adjacent flag functions (`grep -n "shouldRouteLiaResultsToDotnet\|shouldRouteLiaReportToDotnet" formmaps-platform/frontend/next.config.ts`) and add nearby:

```typescript
// LIA session write lifecycle (FM-DOTNET-029): all 7 write endpoints + the 3 reads that share their
// lazy-expiry logic, cut over together under ONE flag to avoid split-writing lia_assessment_sessions
// across two backends. Default OFF.
function shouldRouteLiaSessionToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_LIA_SESSION_TO_DOTNET));
}
```

- [ ] **Step 2: Add the 10 rewrite entries**

Add inside the `rewrites()` array, near the existing LIA results rewrites:

```typescript
      ...(shouldRouteLiaSessionToDotnet()
        ? [
            { source: "/api/v1/lia/access", destination: `${dotnetApiBaseUrl}/api/v1/lia/access` },
            { source: "/api/v1/lia/start", destination: `${dotnetApiBaseUrl}/api/v1/lia/start` },
            { source: "/api/v1/lia/session/:sessionId", destination: `${dotnetApiBaseUrl}/api/v1/lia/session/:sessionId` },
            { source: "/api/v1/lia/session/:sessionId/practice", destination: `${dotnetApiBaseUrl}/api/v1/lia/session/:sessionId/practice` },
            { source: "/api/v1/lia/session/:sessionId/practice/answer", destination: `${dotnetApiBaseUrl}/api/v1/lia/session/:sessionId/practice/answer` },
            { source: "/api/v1/lia/session/:sessionId/subtest/start", destination: `${dotnetApiBaseUrl}/api/v1/lia/session/:sessionId/subtest/start` },
            { source: "/api/v1/lia/session/:sessionId/answer", destination: `${dotnetApiBaseUrl}/api/v1/lia/session/:sessionId/answer` },
            { source: "/api/v1/lia/session/:sessionId/timeout", destination: `${dotnetApiBaseUrl}/api/v1/lia/session/:sessionId/timeout` },
            { source: "/api/v1/lia/session/:sessionId/violations", destination: `${dotnetApiBaseUrl}/api/v1/lia/session/:sessionId/violations` },
            { source: "/api/v1/lia/session/:sessionId/complete", destination: `${dotnetApiBaseUrl}/api/v1/lia/session/:sessionId/complete` },
          ]
        : []),
```

**Note**: `/api/v1/lia/session/:sessionId/results` (already-live reads, FM-015) must NOT be touched — it's a distinct, more-specific path already routed by its own existing flag; verify with `git diff` that block is untouched (FM-061 gotcha).

- [ ] **Step 3: Diff-verify, typecheck, build**

```bash
cd formmaps-platform
git diff --stat frontend/next.config.ts   # expect only additions
cd frontend && npx tsc --noEmit && npm run build
```
Expected: clean diff (additive only), 0 tsc errors, build succeeds with the flag unset (dark by default).

- [ ] **Step 4: Commit + push**

```bash
cd formmaps-platform
git add frontend/next.config.ts
git commit -m "feat(migration): wire FM-029 LIA session write lifecycle rewrites, flag default OFF"
git push origin develop
```

---

## Self-Review

- **Spec coverage**: Task 1 = EN verbal-twin + schema. Task 2 = question-serving DTOs. Task 3 = `StartAsync` + shared helpers (covers adversarial test #1). Task 4 = `StartSubtestAsync` (covers adversarial tests #2/#3). Tasks 5-6 = the remaining 4 write endpoints. Task 7 = the 3 reads. Task 8 = endpoints. Task 9 = frontend wire-up. Every spec section has a task.
- **Placeholder scan**: two explicit "confirm against source before shipping" call-outs remain (`MAX_REENTRIES`/`PROCTORING_FLAG_THRESHOLD`/`SUBTEST_CONFIGS` exact values, and the exact `IFormMapsWritableSession`/session-factory type name) — these are flagged AS explicit verification steps with exact grep commands to resolve them, not vague TODOs; resolve them at Task 3 Step 1/4 before writing code that depends on the wrong numbers.
- **Type consistency**: `AnswerResult`/`LiaSubmitAnswerStatus` defined in Task 5, reused as-is by Task 6's `HandleTimeoutAsync` (legacy `handleTimeout` returns the same shape) — verified no redefinition. `TimeoutAdvanceResult` used identically by Tasks 3/5/6.
- **Scope**: this is one cohesive subsystem (one row, one state machine) — appropriately a single large plan, not multiple independent specs, matching the approved design's own reasoning.
