using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins legacy checkAccess: completed wins (newest completed) over in-progress over open; the reason
/// key only appears on the completed branch; existing_session_id only when a session exists.
/// </summary>
public class PersonalityAccessTests
{
    private static PersonalitySessionStatus S(string id, string status) => new(id, status);

    [Fact]
    public void No_sessions_grants_open_access()
    {
        var r = PersonalityAccess.Evaluate([]);
        Assert.True(r.HasAccess);
        Assert.False(r.HasCompleted);
        Assert.Null(r.ExistingSessionId);
        Assert.Null(r.Reason);
    }

    [Fact]
    public void In_progress_grants_access_with_existing_id_no_reason()
    {
        var r = PersonalityAccess.Evaluate([S("ip1", "in_progress")]);
        Assert.True(r.HasAccess);
        Assert.False(r.HasCompleted);
        Assert.Equal("ip1", r.ExistingSessionId);
        Assert.Null(r.Reason); // reason omitted on the in-progress branch
    }

    [Fact]
    public void Completed_blocks_access_with_reason()
    {
        var r = PersonalityAccess.Evaluate([S("c1", "completed")]);
        Assert.False(r.HasAccess);
        Assert.True(r.HasCompleted);
        Assert.Equal("c1", r.ExistingSessionId);
        Assert.Equal("already_completed", r.Reason);
    }

    [Fact]
    public void Completed_wins_over_in_progress_regardless_of_order()
    {
        // Newest-first list with both; legacy checks completed across the whole list first.
        var r = PersonalityAccess.Evaluate([S("ip", "in_progress"), S("c", "completed")]);
        Assert.False(r.HasAccess);
        Assert.True(r.HasCompleted);
        Assert.Equal("c", r.ExistingSessionId);
    }

    [Fact]
    public void Picks_newest_completed_first()
    {
        // Callers pass newest-first; first completed encountered wins.
        var r = PersonalityAccess.Evaluate([S("new", "completed"), S("old", "completed")]);
        Assert.Equal("new", r.ExistingSessionId);
    }
}
