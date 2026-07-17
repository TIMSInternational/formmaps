using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Discriminated outcome for the pca-exam take/submit writes (legacy examRouter start/submit). Maps to the
/// exact legacy status/body: <c>ExamNotFound</c> -&gt; 404 "Exam not found"; <c>SessionNotFound</c> -&gt; 404
/// "Session not found"; <c>AlreadyCompleted</c> -&gt; 409 "Exam already completed"; <c>Ok</c> -&gt; 200.
/// </summary>
public enum PcaExamWriteStatus
{
    Ok,
    ExamNotFound,
    SessionNotFound,
    AlreadyCompleted,
}

/// <summary>
/// An answer-key-stripped served question (start payload). Carries ONLY questionNumber/questionText/type/data
/// — correctAnswer and explanation NEVER leave the server (scoring uses the DB key in submit).
/// camelCase via the ASP.NET Core Web JSON default; <c>Data</c> (a jsonb object) passes through verbatim.
/// </summary>
public sealed record ServedExamQuestion(int QuestionNumber, string QuestionText, string Type, JsonElement Data);

/// <summary>Legacy startExamSession return shape.</summary>
public sealed record ExamStartPayload(
    string SessionId,
    string ExamId,
    string ExamName,
    int TimeLimitMinutes,
    int TotalQuestions,
    IReadOnlyList<ServedExamQuestion> Questions);

/// <summary>Legacy submitExam return shape ({ sessionId, score, correct, total, status }).</summary>
public sealed record ExamSubmitResult(string SessionId, double Score, int Correct, int Total, string Status);

/// <summary>
/// One submitted answer, already coalesced by the endpoint: <c>UserAnswer</c> =
/// String(answer ?? selectedAnswer ?? ""), <c>TimeSpent</c> = the parsed seconds. The writer looks the
/// question up by <see cref="QuestionNumber"/> to derive correctAnswer + isCorrect server-side.
/// </summary>
public sealed record SubmitAnswer(int QuestionNumber, string UserAnswer, int TimeSpent);

public sealed record PcaExamStartOutcome(PcaExamWriteStatus Status, ExamStartPayload? Payload);

public sealed record PcaExamSubmitOutcome(PcaExamWriteStatus Status, ExamSubmitResult? Result);

/// <summary>
/// Write-owner for the pca-exam take/submit path (legacy assessmentService.ts startExamSession + submitExam).
/// <b>Partial lifecycle:</b> Node still owns <c>/complete</c> (timeout) writes on pca_exam_sessions, so the
/// prod route-flip stays deferred (dual-write). Submit is TOCTOU-safe + idempotent: a completed OR
/// time-expired session (isCompleted || status='Completed') 409s before any write, so the report-visible
/// answer key can never be replayed to force 100% and no duplicate answer rows are appended (corpus #18).
/// </summary>
public interface IPcaExamWriter
{
    /// <summary>Legacy startExamSession: create an InProgress session (retake of a Completed one -&gt; AlreadyCompleted); serve answer-key-stripped questions.</summary>
    Task<PcaExamStartOutcome> StartExamAsync(
        RequestContext context,
        string examId,
        string userId,
        CancellationToken cancellationToken = default);

    /// <summary>Legacy submitExam: score in-handler, persist answers + the completed session under a FOR UPDATE lock.</summary>
    Task<PcaExamSubmitOutcome> SubmitExamAsync(
        RequestContext context,
        string sessionId,
        IReadOnlyList<SubmitAnswer> answers,
        int timeTaken,
        CancellationToken cancellationToken = default);
}
