using FormMaps.Application.SchoolUsers;

namespace FormMaps.UnitTests.SchoolUsers;

/// <summary>
/// The authorization rule for PUT /api/v1/school-admin/users/{userId}/role (formmaps#114):
///
/// <para><b>a school admin may move a STAFF member between STAFF roles inside their OWN school, and nothing
/// else.</b></para>
///
/// Every test here is an ATTEMPT TO VIOLATE that rule which must be refused. They are the .NET half of
/// api/src/__tests__/school-user-role-contract.test.ts and must stay in lockstep with it — one flag co-flips the
/// whole SchoolUsers cluster, so a guard that exists in one backend and not the other is a privilege bug waiting on
/// a flag.
/// </summary>
public class RoleChangeGuardTests
{
    private const string Caller = "admin-1";
    private const string Target = "target-1";
    private const string School = "school-1";

    private static RoleUpdateStatus Evaluate(
        string? callerSchoolId = School,
        string? targetSchoolId = School,
        string? targetRole = "counselor",
        bool targetExists = true,
        string requested = "staff",
        string targetId = Target) =>
        RoleChangeGuard.Evaluate(Caller, targetId, callerSchoolId, targetSchoolId, targetRole, targetExists, requested);

    // ── G2: the self guard ──────────────────────────────────────────────────────

    [Fact]
    public void An_admin_may_not_change_their_own_role()
    {
        Assert.Equal(RoleUpdateStatus.SelfChange, Evaluate(targetId: Caller, targetRole: "school_admin"));
    }

    [Fact]
    public void The_self_guard_runs_before_everything_else()
    {
        // Even with every other input pointing at a legal move, caller === target loses.
        Assert.Equal(RoleUpdateStatus.SelfChange, Evaluate(targetId: Caller, targetRole: "counselor"));
    }

    // ── G3: the tenant gate ─────────────────────────────────────────────────────

    [Fact]
    public void A_target_in_another_school_is_refused()
    {
        Assert.Equal(RoleUpdateStatus.CrossSchool, Evaluate(targetSchoolId: "school-2"));
    }

    [Theory]
    [InlineData(null, School)]   // caller has no school (incl. a schoolless SuperAdmin — no exemption, deliberately)
    [InlineData(School, null)]   // target has no school
    [InlineData("", "")]         // BOTH empty-string: falsy is NOT "same school" (legacy `!admin?.schoolId || …`)
    [InlineData(null, null)]
    public void A_falsy_schoolId_on_either_side_is_never_same_school(string? callerSchoolId, string? targetSchoolId)
    {
        Assert.Equal(RoleUpdateStatus.CrossSchool, Evaluate(callerSchoolId, targetSchoolId));
    }

    [Fact]
    public void A_missing_target_is_a_404_not_a_cross_school_403()
    {
        Assert.Equal(RoleUpdateStatus.TargetNotFound, Evaluate(targetExists: false, targetSchoolId: null, targetRole: null));
    }

    // ── G5: the source-role guard (WHO you may edit, not just what you may set) ──

    [Fact]
    public void Demoting_a_peer_school_admin_is_refused_this_is_the_lock_the_school_out_attack()
    {
        // G4 is satisfied — "staff" is a perfectly legal destination. G5 is the ONLY thing standing between a school
        // admin and demoting every other admin in their school. Delete it and this test must go red.
        Assert.Equal(RoleUpdateStatus.ProtectedAdminTarget, Evaluate(targetRole: "school_admin"));
    }

    [Theory]
    [InlineData("Super Admin")]
    [InlineData("super_admin")]
    [InlineData("superadmin")]
    [InlineData("admin")]
    [InlineData("School_Admin")]
    [InlineData("school admin")]
    [InlineData("SCHOOL_ADMIN")]
    public void Every_alias_spelling_of_an_admin_role_is_refused(string currentRole)
    {
        // Aliases go through FormMapsRoles.Normalize precisely so a casing or spelling variant cannot slip past.
        Assert.Equal(RoleUpdateStatus.ProtectedAdminTarget, Evaluate(targetRole: currentRole));
    }

    [Theory]
    [InlineData("student")]
    [InlineData("Student")]
    [InlineData("parent")]
    [InlineData("user")]
    public void Converting_a_student_or_parent_into_staff_is_refused(string currentRole)
    {
        // Student rows carry gradeLevel, counselor_student_assignments and assessment data that a bare roleName flip
        // would silently orphan. That is a different operation, out of this route's scope.
        Assert.Equal(RoleUpdateStatus.ProtectedStudentTarget, Evaluate(targetRole: currentRole));
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("some_future_role")]
    public void An_unrecognised_current_role_fails_closed(string? currentRole)
    {
        Assert.Equal(RoleUpdateStatus.ProtectedStudentTarget, Evaluate(targetRole: currentRole));
    }

    [Fact]
    public void Staff_is_a_legal_SOURCE_role_even_though_Normalize_maps_it_to_Parent()
    {
        // The trap: FormMapsRoles.Normalize("staff") is Parent, so using it for MEMBERSHIP would refuse a legal
        // staff → teacher move. Membership is the literal allowlist; Normalize only picks the refusal message.
        Assert.Equal(RoleUpdateStatus.Updated, Evaluate(targetRole: "staff", requested: "teacher"));
    }

    // ── the permitted move, and idempotence ─────────────────────────────────────

    [Theory]
    [InlineData("counselor", "teacher")]
    [InlineData("teacher", "staff")]
    [InlineData("staff", "coach")]
    [InlineData("coach", "counselor")]
    [InlineData("Counselor", "coach")] // the stored roleName's casing must not matter
    public void A_staff_to_staff_move_inside_one_school_is_allowed(string current, string requested)
    {
        Assert.Equal(RoleUpdateStatus.Updated, Evaluate(targetRole: current, requested: requested));
    }

    [Theory]
    [InlineData("coach")]
    [InlineData("Coach")]
    public void Re_requesting_the_role_the_user_already_holds_is_a_NoChange(string current)
    {
        // Pinned identically in Node (400 "User already has this role", authService.changeRole's precedent) so the
        // two backends cannot disagree about idempotence.
        Assert.Equal(RoleUpdateStatus.NoChange, Evaluate(targetRole: current, requested: "coach"));
    }
}
