using FormMaps.Application.Audit;

namespace FormMaps.UnitTests.Audit;

public class AuditEventTests
{
    /// <summary>
    /// Every v1 call site constructs an AuditEvent positionally and omits the last two arguments.
    /// The 'success' default and the null Metadata default are therefore load-bearing for the
    /// audit_events NOT NULL outcome column -- if either default drifts, Task 3's INSERT breaks.
    /// </summary>
    [Fact]
    public void AuditEvent_DefaultsToSuccessOutcomeAndNoMetadata()
    {
        var auditEvent = new AuditEvent(
            EventType: "audit.assessment.lia.completed",
            ActorUserId: "user_1",
            ActorRole: "student",
            SchoolId: "school_1",
            SubjectType: "lia_session",
            SubjectId: "session_1");

        Assert.Equal("success", auditEvent.Outcome);
        Assert.Null(auditEvent.Metadata);
    }
}
