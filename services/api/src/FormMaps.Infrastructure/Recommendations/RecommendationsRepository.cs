using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Recommendations;

namespace FormMaps.Infrastructure.Recommendations;

/// <summary>
/// Raw-Npgsql data access for the letters-of-recommendation port (formmaps#59 — services/recommendationsService.ts).
/// Every session is opened with the CALLER's <see cref="RequestContext"/>, so the production RLS policy on
/// <c>recommendation_requests</c> (003-fk-users.sql) and on <c>recommendation_application_links</c>
/// (004-fk-parent.sql) applies exactly as it does to legacy Node's Prisma extension. No bypass session anywhere.
///
/// <para>ORDERING. Prisma's <c>orderBy: { createdDate: "desc" }</c> leaves ties unordered; every list here adds
/// <c>, "id" ASC</c> as a deterministic tiebreak (same convention as the FM-083 college slice). The
/// <c>include: { applicationLinks: true }</c> nested collection carries NO orderBy in legacy at all and is loaded
/// here with a stable one for the same reason.</para>
///
/// <para>Fixed-column INSERT/SET everywhere (mass-assignment guard); timestamps bind Kind=Unspecified and
/// ms-truncated (the FM-029 tz rule) and are read back as ISO-Z strings.</para>
/// </summary>
public sealed class RecommendationsRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IRecommendationsRepository
{
    private const string RequestColumns =
        """
        "id", "studentId", "recommenderId", "status", "relationship", "requestMessage", "declineReason", "dueDate",
        "submittedAt", "letterFileKey", "letterFileName", "letterUploadedAt", "isActive", "createdBy", "createdDate",
        "updatedBy", "updatedAt"
        """;

    private const string PrefixedRequestColumns =
        """
        r."id", r."studentId", r."recommenderId", r."status", r."relationship", r."requestMessage", r."declineReason",
        r."dueDate", r."submittedAt", r."letterFileKey", r."letterFileName", r."letterUploadedAt", r."isActive",
        r."createdBy", r."createdDate", r."updatedBy", r."updatedAt"
        """;

    private const string LinkColumns =
        """
        "id", "recommendationRequestId", "studentApplicationId", "isSubmitted", "submittedAt", "isActive",
        "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    private const int RequestFieldCount = 17;

    // =============================================================================================================
    // createRequest
    // =============================================================================================================

    public async Task<int> CountTodaysRequestedAsync(
        RequestContext context, string studentId, DateTime todayStart, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT count(*) FROM "recommendation_requests"
            WHERE "studentId" = @sid AND "status" = 'requested'
              AND ("createdDate" >= @start OR "updatedAt" >= @start)
            """);
        AddParameter(command, "sid", studentId);
        AddTimestamp(command, "start", todayStart);
        return (int)(long)(await command.ExecuteScalarAsync(cancellationToken))!;
    }

    public async Task<RecommendationUser?> FindUserAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT "id", "name", "email", "roleName", "schoolId", "isActive" FROM "users" WHERE "id" = @id LIMIT 1
            """);
        AddParameter(command, "id", userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new RecommendationUser(
            reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.GetBoolean(5));
    }

    public async Task<bool> HasCoachBookingAsync(
        RequestContext context, string studentId, string recommenderUserId, CancellationToken cancellationToken = default)
    {
        // Legacy is two queries: coach.findUnique({ where: { userId } }) — deliberately WITHOUT an isActive filter —
        // then booking.findFirst({ coachId, studentId, isActive: true }). Folded into one statement; same predicate.
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT 1 FROM "bookings" b
            WHERE b."studentId" = @sid AND b."isActive" = true
              AND b."coachId" IN (SELECT c."id" FROM "coaches" c WHERE c."userId" = @uid)
            LIMIT 1
            """);
        AddParameter(command, "sid", studentId);
        AddParameter(command, "uid", recommenderUserId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null and not DBNull;
    }

    public async Task<RecommendationRequestRow?> FindByPairAsync(
        RequestContext context, string studentId, string recommenderId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            SELECT {RequestColumns} FROM "recommendation_requests"
            WHERE "studentId" = @sid AND "recommenderId" = @rid LIMIT 1
            """);
        AddParameter(command, "sid", studentId);
        AddParameter(command, "rid", recommenderId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapRequest(reader, 0) : null;
    }

    public async Task<RecommendationRequestRow> ReactivateAsync(
        RequestContext context, string id, CreateRequestInput input, DateTime? dueDate,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            UPDATE "recommendation_requests" SET
                "status" = 'requested',
                "relationship" = @rel,
                "requestMessage" = @msg,
                "dueDate" = @due,
                "declineReason" = NULL,
                "submittedAt" = NULL,
                "letterFileKey" = NULL,
                "letterFileName" = NULL,
                "letterUploadedAt" = NULL,
                "isActive" = true,
                "updatedBy" = @by,
                "updatedAt" = @now
            WHERE "id" = @id
            RETURNING {RequestColumns}
            """);
        AddParameter(command, "id", id);
        AddParameter(command, "rel", input.Relationship);
        AddParameter(command, "msg", input.RequestMessage);
        AddNullableTimestamp(command, "due", dueDate);
        AddParameter(command, "by", input.StudentId);
        AddTimestamp(command, "now", Now());

        var row = await ReadOneRequestAsync(command, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<CreateRowResult> CreateAsync(
        RequestContext context, CreateRequestInput input, DateTime? dueDate, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            INSERT INTO "recommendation_requests" (
                "id", "studentId", "recommenderId", "status", "relationship", "requestMessage", "dueDate",
                "createdBy", "createdDate", "updatedAt")
            VALUES (gen_random_uuid()::text, @sid, @rid, 'requested', @rel, @msg, @due, @by, @now, @now)
            ON CONFLICT ("studentId", "recommenderId") DO NOTHING
            RETURNING {RequestColumns}
            """);
        AddParameter(command, "sid", input.StudentId);
        AddParameter(command, "rid", input.RecommenderId);
        AddParameter(command, "rel", input.Relationship);
        AddParameter(command, "msg", input.RequestMessage);
        AddNullableTimestamp(command, "due", dueDate);
        AddParameter(command, "by", input.StudentId);
        AddTimestamp(command, "now", Now());

        RecommendationRequestRow? row;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            // DO NOTHING returns no row on conflict — the ported equivalent of Prisma's P2002 branch, which turns
            // into the same 409 at the service. Losing the race is the only way to get here (the pre-read already
            // found nothing), so this is the concurrency path, not the normal one.
            row = await reader.ReadAsync(cancellationToken) ? MapRequest(reader, 0) : null;
        }

        await session.CommitAsync(cancellationToken);
        return new CreateRowResult(row, row is null);
    }

    // =============================================================================================================
    // Reads
    // =============================================================================================================

    public async Task<IReadOnlyList<StudentRequestRow>> ListForStudentAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var rows = new List<(RecommendationRequestRow Request, RecommenderRef Recommender)>();
        await using (var command = Command(session, $"""
            SELECT {PrefixedRequestColumns}, u."id", u."name", u."email", u."roleName"
            FROM "recommendation_requests" r
            JOIN "users" u ON u."id" = r."recommenderId"
            WHERE r."studentId" = @sid AND r."isActive" = true
            ORDER BY r."createdDate" DESC, r."id" ASC
            """))
        {
            AddParameter(command, "sid", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var request = MapRequest(reader, 0);
                var recommender = new RecommenderRef(
                    reader.GetString(RequestFieldCount),
                    reader.IsDBNull(RequestFieldCount + 1) ? null : reader.GetString(RequestFieldCount + 1),
                    reader.GetString(RequestFieldCount + 2),
                    reader.IsDBNull(RequestFieldCount + 3) ? null : reader.GetString(RequestFieldCount + 3));
                rows.Add((request, recommender));
            }
        }

        var links = await LoadLinksAsync(session, rows.Select(r => r.Request.Id).ToArray(), cancellationToken);
        return rows
            .Select(r => new StudentRequestRow(r.Request, r.Recommender, Links(links, r.Request.Id)))
            .ToList();
    }

    public async Task<IReadOnlyList<ReceivedRequestRow>> ListReceivedAsync(
        RequestContext context, string recommenderId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var rows = new List<(RecommendationRequestRow Request, UserRef Student)>();
        await using (var command = Command(session, $"""
            SELECT {PrefixedRequestColumns}, s."id", s."name", s."email"
            FROM "recommendation_requests" r
            JOIN "users" s ON s."id" = r."studentId"
            WHERE r."recommenderId" = @rid AND r."isActive" = true
            ORDER BY r."createdDate" DESC, r."id" ASC
            """))
        {
            AddParameter(command, "rid", recommenderId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add((MapRequest(reader, 0), MapUserRef(reader, RequestFieldCount)));
            }
        }

        var links = await LoadLinksAsync(session, rows.Select(r => r.Request.Id).ToArray(), cancellationToken);
        return rows
            .Select(r => new ReceivedRequestRow(r.Request, r.Student, Links(links, r.Request.Id)))
            .ToList();
    }

    public async Task<IReadOnlyList<EligibleRecommender>> SearchStaffAsync(
        RequestContext context, string schoolId, string search, int limit, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var filter = string.IsNullOrEmpty(search)
            ? ""
            : """AND ("name" ILIKE @q ESCAPE '\' OR "email" ILIKE @q ESCAPE '\') """;
        await using var command = Command(session, $"""
            SELECT "id", "name", "email", "roleName" FROM "users"
            WHERE "schoolId" = @school AND "isActive" = true
              AND "roleName" IN ('counselor', 'school_admin', 'teacher')
              {filter}
            ORDER BY "name" {Direction(limit)}
            LIMIT @take
            """);
        AddParameter(command, "school", schoolId);
        if (!string.IsNullOrEmpty(search))
        {
            AddParameter(command, "q", Contains(search));
        }

        AddInt(command, "take", Math.Abs(limit));
        return Orient(await ReadRecommendersAsync(command, cancellationToken), limit);
    }

    public async Task<IReadOnlyList<EligibleRecommender>> SearchBookedCoachesAsync(
        RequestContext context, string studentId, string search, int limit, CancellationToken cancellationToken = default)
    {
        // Legacy's three sequential queries (bookings → coaches → users), folded into nested IN subqueries. Note
        // the asymmetry with HasCoachBookingAsync: THIS path filters coaches."isActive", the eligibility check
        // does not. Both are ported as legacy wrote them.
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var filter = string.IsNullOrEmpty(search)
            ? ""
            : """AND (u."name" ILIKE @q ESCAPE '\' OR u."email" ILIKE @q ESCAPE '\') """;
        await using var command = Command(session, $"""
            SELECT u."id", u."name", u."email", u."roleName" FROM "users" u
            WHERE u."isActive" = true
              AND u."id" IN (
                  SELECT c."userId" FROM "coaches" c
                  WHERE c."isActive" = true
                    AND c."id" IN (SELECT b."coachId" FROM "bookings" b WHERE b."studentId" = @sid AND b."isActive" = true))
              {filter}
            ORDER BY u."name" {Direction(limit)}
            LIMIT @take
            """);
        AddParameter(command, "sid", studentId);
        if (!string.IsNullOrEmpty(search))
        {
            AddParameter(command, "q", Contains(search));
        }

        AddInt(command, "take", Math.Abs(limit));
        return Orient(await ReadRecommendersAsync(command, cancellationToken), limit);
    }

    public async Task<IReadOnlyList<DashboardRequestRow>> ListDashboardAsync(
        RequestContext context, DashboardScope scope, string userId, string schoolId,
        CancellationToken cancellationToken = default)
    {
        // The three role branches, each an exact transcription of the legacy `where` (getDashboard, service:294).
        // The two `{ in: [...] }` branches match nothing when the id list is empty — the IN subqueries do the same.
        var predicate = scope switch
        {
            DashboardScope.Recommender =>
                """r."recommenderId" = @uid AND r."isActive" = true""",
            DashboardScope.AssignedStudents =>
                """
                r."studentId" IN (
                    SELECT a."studentId" FROM "counselor_student_assignments" a
                    WHERE a."counselorId" = @uid AND a."isActive" = true)
                AND r."isActive" = true
                """,
            _ =>
                """
                r."studentId" IN (SELECT su."id" FROM "users" su WHERE su."schoolId" = @school AND su."isActive" = true)
                AND r."isActive" = true
                """,
        };

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var rows = new List<(RecommendationRequestRow Request, UserRef Student, UserRef Recommender)>();
        await using (var command = Command(session, $"""
            SELECT {PrefixedRequestColumns},
                   s."id", s."name", s."email",
                   m."id", m."name", m."email"
            FROM "recommendation_requests" r
            JOIN "users" s ON s."id" = r."studentId"
            JOIN "users" m ON m."id" = r."recommenderId"
            WHERE {predicate}
            ORDER BY r."createdDate" DESC, r."id" ASC
            """))
        {
            AddParameter(command, "uid", userId);
            AddParameter(command, "school", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add((
                    MapRequest(reader, 0),
                    MapUserRef(reader, RequestFieldCount),
                    MapUserRef(reader, RequestFieldCount + 3)));
            }
        }

        var links = await LoadLinksAsync(session, rows.Select(r => r.Request.Id).ToArray(), cancellationToken);
        return rows
            .Select(r => new DashboardRequestRow(r.Request, r.Student, r.Recommender, Links(links, r.Request.Id)))
            .ToList();
    }

    public async Task<OwnedRequest?> FindByIdWithUsersAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            SELECT {PrefixedRequestColumns},
                   s."id", s."name", s."email",
                   m."id", m."name", m."email"
            FROM "recommendation_requests" r
            JOIN "users" s ON s."id" = r."studentId"
            JOIN "users" m ON m."id" = r."recommenderId"
            WHERE r."id" = @id
            LIMIT 1
            """);
        AddParameter(command, "id", id);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new OwnedRequest(
            MapRequest(reader, 0),
            MapUserRef(reader, RequestFieldCount),
            MapUserRef(reader, RequestFieldCount + 3));
    }

    public async Task<RecommendationRequestRow?> FindByIdAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session,
            $"""SELECT {RequestColumns} FROM "recommendation_requests" WHERE "id" = @id LIMIT 1""");
        AddParameter(command, "id", id);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapRequest(reader, 0) : null;
    }

    // =============================================================================================================
    // Recommender writes
    // =============================================================================================================

    public async Task<RecommendationRequestRow> RespondAsync(
        RequestContext context, string id, string recommenderId, string newStatus, bool writeDeclineReason,
        string? declineReason, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        // On accept legacy passes declineReason: undefined → Prisma omits the column entirely, so an earlier
        // decline reason SURVIVES the accept. The SET list is built the same way.
        var reasonClause = writeDeclineReason ? "\"declineReason\" = @reason," : "";
        await using var command = Command(session, $"""
            UPDATE "recommendation_requests" SET
                "status" = @status,
                {reasonClause}
                "updatedBy" = @by,
                "updatedAt" = @now
            WHERE "id" = @id
            RETURNING {RequestColumns}
            """);
        AddParameter(command, "id", id);
        AddParameter(command, "status", newStatus);
        if (writeDeclineReason)
        {
            AddNullableString(command, "reason", declineReason);
        }

        AddParameter(command, "by", recommenderId);
        AddTimestamp(command, "now", Now());

        var row = await ReadOneRequestAsync(command, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<RecommendationRequestRow> UpdateStatusAsync(
        RequestContext context, string id, string recommenderId, string status, CancellationToken cancellationToken = default)
    {
        var now = Now();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        var submittedClause = status == "submitted" ? "\"submittedAt\" = @now," : "";
        await using var command = Command(session, $"""
            UPDATE "recommendation_requests" SET
                "status" = @status,
                {submittedClause}
                "updatedBy" = @by,
                "updatedAt" = @now
            WHERE "id" = @id
            RETURNING {RequestColumns}
            """);
        AddParameter(command, "id", id);
        AddParameter(command, "status", status);
        AddParameter(command, "by", recommenderId);
        AddTimestamp(command, "now", now);

        var row = await ReadOneRequestAsync(command, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<RecommendationRequestRow> SetLetterAsync(
        RequestContext context, string id, string recommenderId, string letterFileKey, string letterFileName,
        CancellationToken cancellationToken = default)
    {
        var now = Now();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            UPDATE "recommendation_requests" SET
                "letterFileKey" = @key,
                "letterFileName" = @name,
                "letterUploadedAt" = @now,
                "status" = 'submitted',
                "submittedAt" = @now,
                "updatedBy" = @by,
                "updatedAt" = @now
            WHERE "id" = @id
            RETURNING {RequestColumns}
            """);
        AddParameter(command, "id", id);
        AddParameter(command, "key", letterFileKey);
        AddParameter(command, "name", letterFileName);
        AddParameter(command, "by", recommenderId);
        AddTimestamp(command, "now", now);

        var row = await ReadOneRequestAsync(command, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return row;
    }

    // =============================================================================================================
    // Application linking
    // =============================================================================================================

    public async Task<IReadOnlyList<string>> FindOwnedActiveApplicationsAsync(
        RequestContext context, string studentId, IReadOnlyList<string> applicationIds,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT "id" FROM "student_applications"
            WHERE "id" = ANY(@ids) AND "studentId" = @sid AND "isActive" = true
            """);
        AddTextArray(command, "ids", applicationIds);
        AddParameter(command, "sid", studentId);

        var ids = new List<string>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            ids.Add(reader.GetString(0));
        }

        return ids;
    }

    public async Task<IReadOnlyList<RecommendationApplicationLinkRow>> UpsertApplicationLinksAsync(
        RequestContext context, string requestId, IReadOnlyList<string> applicationIds, string studentId,
        CancellationToken cancellationToken = default)
    {
        var now = Now();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        var rows = new List<RecommendationApplicationLinkRow>(applicationIds.Count);

        // One statement per id, in the order given — legacy maps over applicationIds under Promise.all and returns
        // that array, so the response order is the REQUEST order, duplicates included.
        //
        // Prisma's upsert with `update: {}` still performs an update on conflict, and @updatedAt fires on any
        // update, so a re-link refreshes updatedAt and nothing else. DO UPDATE SET "updatedAt" reproduces that.
        foreach (var applicationId in applicationIds)
        {
            await using var command = Command(session, $"""
                INSERT INTO "recommendation_application_links" (
                    "id", "recommendationRequestId", "studentApplicationId", "createdBy", "createdDate", "updatedAt")
                VALUES (gen_random_uuid()::text, @rid, @aid, @by, @now, @now)
                ON CONFLICT ("recommendationRequestId", "studentApplicationId")
                DO UPDATE SET "updatedAt" = @now
                RETURNING {LinkColumns}
                """);
            AddParameter(command, "rid", requestId);
            AddParameter(command, "aid", applicationId);
            AddParameter(command, "by", studentId);
            AddTimestamp(command, "now", now);

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            rows.Add(MapLink(reader));
        }

        await session.CommitAsync(cancellationToken);
        return rows;
    }

    // =============================================================================================================

    public async Task<string?> GetCallerSchoolIdAsync(RequestContext context, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @id LIMIT 1""");
        AddParameter(command, "id", context.Actor!.UserId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? null : (string)result;
    }

    // ---- helpers ----

    private static async Task<IReadOnlyList<EligibleRecommender>> ReadRecommendersAsync(
        DbCommand command, CancellationToken cancellationToken)
    {
        var rows = new List<EligibleRecommender>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new EligibleRecommender(
                reader.GetString(0),
                reader.IsDBNull(1) ? null : reader.GetString(1),
                reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetString(3)));
        }

        return rows;
    }

    private static async Task<ILookup<string, RecommendationApplicationLinkRow>> LoadLinksAsync(
        FormMapsDatabaseSession session, string[] requestIds, CancellationToken cancellationToken)
    {
        if (requestIds.Length == 0)
        {
            return Array.Empty<RecommendationApplicationLinkRow>().ToLookup(l => l.RecommendationRequestId);
        }

        await using var command = Command(session, $"""
            SELECT {LinkColumns} FROM "recommendation_application_links"
            WHERE "recommendationRequestId" = ANY(@ids)
            ORDER BY "createdDate" ASC, "id" ASC
            """);
        AddTextArray(command, "ids", requestIds);

        var rows = new List<RecommendationApplicationLinkRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(MapLink(reader));
        }

        return rows.ToLookup(l => l.RecommendationRequestId, StringComparer.Ordinal);
    }

    private static IReadOnlyList<RecommendationApplicationLinkRow> Links(
        ILookup<string, RecommendationApplicationLinkRow> lookup, string requestId) => lookup[requestId].ToList();

    private static async Task<RecommendationRequestRow> ReadOneRequestAsync(
        DbCommand command, CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return MapRequest(reader, 0);
    }

    private static RecommendationRequestRow MapRequest(DbDataReader reader, int offset) => new(
        Id: reader.GetString(offset + 0),
        StudentId: reader.GetString(offset + 1),
        RecommenderId: reader.GetString(offset + 2),
        Status: reader.GetString(offset + 3),
        Relationship: NullableString(reader, offset + 4),
        RequestMessage: NullableString(reader, offset + 5),
        DeclineReason: NullableString(reader, offset + 6),
        DueDate: NullableIsoZ(reader, offset + 7),
        SubmittedAt: NullableIsoZ(reader, offset + 8),
        LetterFileKey: NullableString(reader, offset + 9),
        LetterFileName: NullableString(reader, offset + 10),
        LetterUploadedAt: NullableIsoZ(reader, offset + 11),
        IsActive: reader.GetBoolean(offset + 12),
        CreatedBy: NullableString(reader, offset + 13),
        CreatedDate: IsoZ(reader.GetDateTime(offset + 14)),
        UpdatedBy: NullableString(reader, offset + 15),
        UpdatedAt: IsoZ(reader.GetDateTime(offset + 16)));

    private static RecommendationApplicationLinkRow MapLink(DbDataReader reader) => new(
        Id: reader.GetString(0),
        RecommendationRequestId: reader.GetString(1),
        StudentApplicationId: reader.GetString(2),
        IsSubmitted: reader.GetBoolean(3),
        SubmittedAt: NullableIsoZ(reader, 4),
        IsActive: reader.GetBoolean(5),
        CreatedBy: NullableString(reader, 6),
        CreatedDate: IsoZ(reader.GetDateTime(7)),
        UpdatedBy: NullableString(reader, 8),
        UpdatedAt: IsoZ(reader.GetDateTime(9)));

    private static UserRef MapUserRef(DbDataReader reader, int offset) => new(
        reader.GetString(offset), NullableString(reader, offset + 1), reader.GetString(offset + 2));

    private static string? NullableString(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);

    private static string? NullableIsoZ(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : IsoZ(reader.GetDateTime(ordinal));

    // Prisma's `take` is SIGNED: a NEGATIVE take means "the last |n| rows of the ordering", still returned in the
    // ordering's direction. GET /staff can produce one (`?limit=-5` survives `parseInt(...) || 10` and
    // `Math.min(n, 20)`), so the two searches reproduce it rather than handing Postgres a negative LIMIT (which
    // errors) or silently clamping (which would return a different set). Positive take → the ordinary path.
    private static string Direction(int limit) => limit < 0 ? "DESC" : "ASC";

    private static IReadOnlyList<EligibleRecommender> Orient(IReadOnlyList<EligibleRecommender> rows, int limit) =>
        limit < 0 ? rows.Reverse().ToList() : rows;

    /// <summary>Prisma `contains` — a LIKE pattern with the three LIKE metacharacters escaped.</summary>
    private static string Contains(string search) =>
        "%" + search.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";

    private DateTime Now() =>
        new(
            timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond * TimeSpan.TicksPerMillisecond,
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

    private static void AddNullableString(DbCommand command, string name, string? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = (object?)value ?? DBNull.Value;
        command.Parameters.Add(parameter);
    }

    private static void AddInt(DbCommand command, string name, int value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.Int32;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static void AddTextArray(DbCommand command, string name, IReadOnlyList<string> values)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = values.ToArray();
        command.Parameters.Add(parameter);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = new DateTime(
            value.Ticks / TimeSpan.TicksPerMillisecond * TimeSpan.TicksPerMillisecond, DateTimeKind.Unspecified);
        command.Parameters.Add(parameter);
    }

    private static void AddNullableTimestamp(DbCommand command, string name, DateTime? value)
    {
        if (value is null)
        {
            var parameter = command.CreateParameter();
            parameter.ParameterName = name;
            parameter.DbType = DbType.DateTime2;
            parameter.Value = DBNull.Value;
            command.Parameters.Add(parameter);
            return;
        }

        AddTimestamp(command, name, value.Value);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
