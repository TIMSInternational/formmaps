using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Video;

namespace FormMaps.Infrastructure.Video;

/// <summary>
/// SQL for routes/video.ts (FM-091..097). See IVideoSessionsRepository for the exact per-method legacy
/// quirks (topic-filtered vs. unfiltered lookups). Timestamps bound Kind=Unspecified + ms-truncated on
/// write; ISO-Z on read, matching CounselorSessionsRepository's own convention for this same table.
/// </summary>
public sealed class VideoSessionsRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IVideoSessionsRepository
{
    private const string SelectColumns =
        """
        cs."id", cs."meetingLink", cs."status", cs."topic", cs."notes", cs."startTime", cs."endTime",
        cs."completedAt", cs."counselorId", uc."name", uc."email", cs."studentId", us."name", us."email"
        """;

    private const string JoinedFrom =
        """
        "counselor_sessions" cs
        LEFT JOIN "users" uc ON uc."id" = cs."counselorId"
        LEFT JOIN "users" us ON us."id" = cs."studentId"
        """;

    public async Task<bool> IsVideoEnabledForSchoolAsync(RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT "videoCallsEnabled" FROM "schools" WHERE "id" = @id""");
        AddParameter(command, "id", schoolId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is bool enabled && enabled;
    }

    public async Task<IReadOnlyList<VideoSessionRow>> ListForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            SELECT {SelectColumns}
            FROM {JoinedFrom}
            WHERE (cs."counselorId" = @uid OR cs."studentId" = @uid)
              AND cs."topic" = 'Video Call' AND cs."meetingLink" <> ''
            ORDER BY cs."startTime" DESC
            LIMIT 50
            """);
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<VideoSessionRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(MapRow(reader));
        }

        return rows;
    }

    public async Task<VideoSessionRow?> GetByIdAsync(RequestContext context, string sessionId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""SELECT {SelectColumns} FROM {JoinedFrom} WHERE cs."id" = @id""");
        AddParameter(command, "id", sessionId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapRow(reader) : null;
    }

    public async Task<VideoSessionRow?> FindByRoomNameAsync(RequestContext context, string roomName, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            SELECT {SelectColumns} FROM {JoinedFrom}
            WHERE cs."meetingLink" = @roomName AND cs."topic" = 'Video Call'
            LIMIT 1
            """);
        AddParameter(command, "roomName", roomName);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapRow(reader) : null;
    }

    public Task<VideoParticipantCandidate?> FindParticipantCandidateAsync(RequestContext context, string userId, CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Task 2");

    public Task<bool> HasActiveCounselorAssignmentAsync(RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Task 2");

    public Task<CreatedVideoSession> CreateAsync(RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Task 2");

    public Task<SessionMutationOutcomeKind> EndAsync(RequestContext context, string sessionId, string callerId, CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Task 2");

    public Task<(SessionMutationOutcomeKind Kind, string? SessionName)> StartAsync(
        RequestContext context, string sessionId, string callerId, CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Task 2");

    private static VideoSessionRow MapRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        SessionName: reader.GetString(1),
        Status: reader.GetString(2),
        Topic: reader.GetString(3),
        Notes: reader.GetString(4),
        StartTime: IsoZ(reader.GetDateTime(5)),
        EndTime: IsoZ(reader.GetDateTime(6)),
        CompletedAt: reader.IsDBNull(7) ? null : IsoZ(reader.GetDateTime(7)),
        CounselorId: reader.GetString(8),
        CounselorName: reader.IsDBNull(9) ? null : reader.GetString(9),
        CounselorEmail: reader.IsDBNull(10) ? null : reader.GetString(10),
        StudentId: reader.GetString(11),
        StudentName: reader.IsDBNull(12) ? null : reader.GetString(12),
        StudentEmail: reader.IsDBNull(13) ? null : reader.GetString(13));

    private DateTime Now() =>
        new DateTime(
            (timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond,
            DateTimeKind.Unspecified);

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
