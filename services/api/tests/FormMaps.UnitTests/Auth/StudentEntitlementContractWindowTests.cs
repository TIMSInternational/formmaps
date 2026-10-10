using FormMaps.Application.Auth;

namespace FormMaps.UnitTests.Auth;

/// <summary>
/// audit 2026-10-09 E4 — mirrors legacy api/src/__tests__/entitlement-contract-window.unit.test.ts. A school's
/// contract window is whole calendar days in the school's timezone (America/Bogota when unset), end INCLUSIVE.
/// Contract dates are plain dates stored as midnight UTC.
/// </summary>
public class StudentEntitlementContractWindowTests
{
    private static DateTimeOffset Utc(int y, int mo, int d, int h = 0, int mi = 0, int s = 0) =>
        new(y, mo, d, h, mi, s, TimeSpan.Zero);

    private static readonly SchoolContract School = new(
        IsActive: true,
        Status: "active",
        ContractStartDate: Utc(2026, 1, 1),
        ContractEndDate: Utc(2026, 10, 9));

    [Fact]
    public void Platform_default_timezone_is_Bogota()
    {
        Assert.Equal("America/Bogota", StudentAccessRules.PlatformTimeZoneId);
    }

    [Fact]
    public void End_date_covers_through_23_59_Bogota_not_00_00_the_next_day()
    {
        // Bogota is UTC-5: 2026-10-09 23:59:59 local = 2026-10-10T04:59:59Z.
        Assert.True(StudentAccessRules.SchoolHasActiveContract(School, Utc(2026, 10, 9, 12)));
        Assert.True(StudentAccessRules.SchoolHasActiveContract(School, Utc(2026, 10, 10, 4, 59, 59)));
        Assert.False(StudentAccessRules.SchoolHasActiveContract(School, Utc(2026, 10, 10, 5)));
    }

    [Fact]
    public void Start_date_covers_from_00_00_Bogota()
    {
        var s = School with { ContractStartDate = Utc(2026, 10, 9), ContractEndDate = Utc(2027, 6, 30) };
        Assert.False(StudentAccessRules.SchoolHasActiveContract(s, Utc(2026, 10, 9, 4, 59, 59)));
        Assert.True(StudentAccessRules.SchoolHasActiveContract(s, Utc(2026, 10, 9, 5)));
    }

    [Fact]
    public void A_schools_own_timezone_wins_and_DST_is_respected()
    {
        // 25 Oct 00:00 CEST (UTC+2) = 24 Oct 22:00Z; DST ends later that night.
        var madrid = School with { TimeZone = "Europe/Madrid", ContractEndDate = Utc(2026, 10, 24) };
        Assert.True(StudentAccessRules.SchoolHasActiveContract(madrid, Utc(2026, 10, 24, 21, 59, 59)));
        Assert.False(StudentAccessRules.SchoolHasActiveContract(madrid, Utc(2026, 10, 24, 22)));
    }

    [Fact]
    public void An_invalid_timezone_falls_back_to_Bogota()
    {
        var bad = School with { TimeZone = "Not/AZone" };
        Assert.True(StudentAccessRules.SchoolHasActiveContract(bad, Utc(2026, 10, 10, 4, 59, 59)));
        Assert.False(StudentAccessRules.SchoolHasActiveContract(bad, Utc(2026, 10, 10, 5)));
    }

    [Fact]
    public void Invited_school_never_covers_even_with_a_valid_window()
    {
        Assert.False(StudentAccessRules.SchoolHasActiveContract(School with { Status = "invited" }, Utc(2026, 6, 1, 12)));
    }

    [Fact]
    public void Active_school_with_no_end_date_does_not_cover()
    {
        // #395: open-ended seed/test schools. The Super Admin coverage report lists them.
        Assert.False(StudentAccessRules.SchoolHasActiveContract(School with { ContractEndDate = null }, Utc(2026, 6, 1, 12)));
        Assert.False(StudentAccessRules.SchoolHasActiveContract(
            School with { ContractStartDate = null, ContractEndDate = null }, Utc(2026, 6, 1, 12)));
    }
}
