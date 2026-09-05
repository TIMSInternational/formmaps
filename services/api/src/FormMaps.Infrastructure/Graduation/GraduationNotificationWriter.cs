using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Graduation;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Graduation;

/// <summary>
/// Port of <c>notifyAll</c> (planWorkflowService.ts:18-37). See
/// <see cref="IGraduationNotificationWriter"/> for the full rationale; the short version is that this is the
/// ONE bypass session in the graduation-plan lane, it is a port of legacy's explicit <c>runAsSystem</c>, and
/// it exists because approval notifications go to school-less PARENTS whose <c>notifications</c> rows the
/// counselor's Identity session cannot insert.
///
/// <para>The payload is closed: recipient ids come from rows the caller already read under their OWN session
/// (counselor_student_assignments / student_parent_links), the type is the literal "course", and the title and
/// message are literals plus a display name. No caller-supplied string reaches this write except the review
/// note, which the caller is the counselor for and which is bounded to 200 characters by the review path
/// before it gets here.</para>
///
/// <para>Failures are logged and swallowed — legacy's try/catch. A notifications outage must not fail a plan
/// submit or a counselor's approval, and turning that into a 500 would not be behaviour-neutral on flip.</para>
/// </summary>
public sealed class GraduationNotificationWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    ILogger<GraduationNotificationWriter> logger) : IGraduationNotificationWriter
{
    public async Task NotifyAllAsync(
        IReadOnlyList<GraduationNotification> rows, string planId, CancellationToken cancellationToken = default)
    {
        // `if (rows.length === 0) return` — before the try, so an empty fan-out opens no session at all.
        if (rows.Count == 0)
        {
            return;
        }

        try
        {
            // RequestContext.System() resolves to the Bypass GUC plan, which is what runAsSystem produces.
            await using var session = await databaseSessionFactory.OpenWritableAsync(
                RequestContext.System(), cancellationToken);

            var now = GraduationPlanDataQuery.Now();

            // `rows.slice(0, 20)` — a hard cap on the fan-out, applied to the ROWS, not per recipient.
            foreach (var row in rows.Take(20))
            {
                await using var command = GraduationPlanDataQuery.Command(session, """
                    INSERT INTO "notifications"
                        ("id", "userId", "type", "title", "message", "isRead", "relatedEntityId",
                         "relatedEntityType", "isActive", "createdDate", "updatedAt")
                    VALUES (gen_random_uuid()::text, @uid, 'course', @title, @message, false, @entity,
                            'graduation_plan', true, @now, @now)
                    """);
                GraduationPlanDataQuery.AddParameter(command, "uid", row.UserId);
                GraduationPlanDataQuery.AddParameter(command, "title", GraduationPlanDataQuery.Slice(row.Title, 120));
                GraduationPlanDataQuery.AddParameter(command, "message", GraduationPlanDataQuery.Slice(row.Message, 500));
                GraduationPlanDataQuery.AddParameter(command, "entity", planId);
                GraduationPlanDataQuery.AddTimestamp(command, "now", now);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await session.CommitAsync(cancellationToken);
        }
        catch (Exception exception)
        {
            // logger.warn({ err }, "Graduation plan notification failed")
            logger.LogWarning(exception, "Graduation plan notification failed");
        }
    }
}
