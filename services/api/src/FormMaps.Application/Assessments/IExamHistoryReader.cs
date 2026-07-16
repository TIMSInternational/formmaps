using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>Reads a user's exam history (legacy getExamHistory) under read-only RLS. Never null.</summary>
public interface IExamHistoryReader
{
    Task<ExamHistory> ReadAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
}
