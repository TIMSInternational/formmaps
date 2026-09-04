namespace FormMaps.Application.Graduation;

/// <summary>One row of legacy <c>notifyAll</c>'s createMany payload (planWorkflowService.ts:18).</summary>
public sealed record GraduationNotification(string UserId, string Title, string Message);

/// <summary>
/// <c>notifyAll</c> (planWorkflowService.ts:18-37) — the graduation-plan notification fan-out.
///
/// <para>THIS IS THE ONE BYPASS SESSION IN THIS LANE, and it is a port, not a shortcut. Legacy wraps the
/// write in <c>runAsSystem</c> for a stated reason: the recipients legitimately cross tenant boundaries.
/// A student's submit notifies their counselors; an approval notifies the student AND their linked PARENTS,
/// and a parent has no schoolId at all (the same fact behind formmaps#121). <c>notifications</c> is ENABLE +
/// FORCE with a userId-or-owner-school policy (003-fk-users.sql:333), so a parent row is invisible to the
/// counselor's Identity session and the insert would be refused. The payload is entirely
/// internally-constructed — recipient ids come from counselor_student_assignments / student_parent_links rows
/// the caller already read under their OWN session, and the title/message strings are literals plus a name.
/// Nothing the caller sends reaches this write.</para>
///
/// <para>formmaps#122-adjacent LAZY-PROMISE TRAP (planWorkflowService.ts:20-27). Legacy's comment documents
/// that <c>runAsSystem(() =&gt; prisma.notification.createMany(...))</c> — handing the PrismaPromise back
/// un-awaited — executes AFTER the AsyncLocalStorage store is restored, so the extension resolves the GUC plan
/// as "deny" instead of "bypass", every insert is refused, and the surrounding catch swallows it: the
/// notifications silently never arrive. Legacy today has the CORRECT <c>async () =&gt; await ...</c> form, so
/// the delivered behaviour is that the rows ARE written. This port cannot reproduce the bug by construction —
/// there is no ambient store and the session is opened, written and committed inside one awaited call — but
/// the failure mode it produced (a swallowed no-op) is exactly what the writer's own integration test asserts
/// against, by reading the rows back on the admin connection rather than trusting a 200.</para>
///
/// <para>Errors are SWALLOWED and logged, never surfaced: legacy's try/catch means a notification failure
/// must not fail the submit or the review. That is behaviour, so it is preserved.</para>
/// </summary>
public interface IGraduationNotificationWriter
{
    /// <summary>
    /// Writes up to the first 20 rows (<c>rows.slice(0, 20)</c>), each with <c>type = "course"</c>,
    /// <c>title</c> truncated to 120 and <c>message</c> to 500 UTF-16 units, related to the plan.
    /// A no-op for an empty list, exactly as legacy returns early.
    /// </summary>
    Task NotifyAllAsync(
        IReadOnlyList<GraduationNotification> rows, string planId, CancellationToken cancellationToken = default);
}
