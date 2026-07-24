using FormMaps.Application.Auth;

namespace FormMaps.Application.AcademicGaps;

/// <summary>
/// FM-DOTNET-080 — the DB reads behind routes/academic-gaps.ts (3 non-AI GETs). Read-only RLS session
/// (legacy tenantContext). Scope resolution is separate so the endpoint can distinguish 400 (no school) /
/// 403 (bad role) from the per-endpoint 404 (student not found / not in school / counselor-unassigned).
/// The detail + recommendations loads return null for ALL three 404 cases (legacy collapses them to
/// 404 "Student not found").
/// </summary>
public interface IAcademicGapsReader
{
    Task<AcademicGapsScope> ResolveScopeAsync(
        RequestContext context, string callerId, CancellationToken cancellationToken = default);

    Task<SummaryLoad> GetSummaryLoadAsync(
        RequestContext context, string schoolId, bool counselorScoped, string callerId,
        CancellationToken cancellationToken = default);

    Task<StudentGapsLoad?> GetStudentDetailLoadAsync(
        RequestContext context, string schoolId, bool counselorScoped, string callerId, string studentId,
        CancellationToken cancellationToken = default);

    Task<RecommendationsLoad?> GetRecommendationsLoadAsync(
        RequestContext context, string schoolId, bool counselorScoped, string callerId, string studentId,
        CancellationToken cancellationToken = default);
}
