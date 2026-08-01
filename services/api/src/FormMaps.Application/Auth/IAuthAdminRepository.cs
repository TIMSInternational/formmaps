namespace FormMaps.Application.Auth;

/// <summary>Row returned by <see cref="IAuthAdminRepository.CreateUserAsync"/> -- just enough to build
/// the access token / response envelope, mirroring <see cref="AuthUserRow"/>'s shape but scoped to
/// what signup's response actually surfaces (no password hash, no isActive/schoolId -- a freshly
/// signed-up self-serve user has neither a school nor any reason to echo the hash back).</summary>
public sealed record CreatedAdminUserRow(string Id, string Name, string Email, string RoleId, string RoleName);

/// <summary>A currently-active role looked up by id, per authAdminService.ts's signup
/// `prisma.role.findFirst({ where: { id: roleId, isActive: true } })` branch (the caller-supplied
/// <c>roleId</c> override path, distinct from the default-to-Student <see cref="IAuthAdminRepository.EnsureRoleAsync"/>
/// path).</summary>
public sealed record AdminRoleRow(string Id, string Name);

/// <summary>Target-user lookup backing PUT /admin/set-password's schoolId-scoping check. Deliberately
/// minimal -- just the columns auth-admin.ts:203-221's inline check and response actually touch
/// (id/email/schoolId), NOT the full <see cref="AuthUserRow"/> shape.</summary>
public sealed record AdminTargetUserRow(string Id, string Email, string? SchoolId);

/// <summary>
/// Domain 10 (Auth) admin-surface reads/writes backing routes/auth-admin.ts's three in-scope routes
/// (POST /signup, GET /unsubscribe, PUT /admin/set-password) -- a SEPARATE repository/interface from
/// <see cref="IAuthRepository"/> per this task's plan, even though both ultimately touch the same
/// "users"/"roles"/"user_settings"/"refresh_tokens" tables as Tasks 6-12's IAuthRepository. Runs
/// entirely under <see cref="RequestContext.System"/> -- signup and unsubscribe are pre-auth public
/// routes, and admin/set-password's caller-schoolId re-read (<see cref="GetUserSchoolIdAsync"/>) is a
/// live DB lookup, not an RLS-scoped read off the caller's own tenant context.
///
/// signup-coach/signup-coach-bulk/coaches/coach/:id/invite-coach (the rest of auth-admin.ts) are
/// explicitly OUT of scope for this task -- a future Coaching domain's problem.
/// </summary>
public interface IAuthAdminRepository
{
    /// <summary>Duplicate-email pre-check for signup, per authAdminService.ts's signup:
    /// `const existing = await prisma.user.findUnique({ where: { email } }); if (existing) return
    /// { ...message: "Unable to create account with this email" };`.</summary>
    Task<bool> EmailExistsAsync(string normalizedEmail, CancellationToken cancellationToken = default);

    /// <summary>
    /// Find-or-create by role name -- the generalized shape of Task 9's
    /// EnsureSchoolAdminRoleAsync, used by signup's default (no caller-supplied roleId) path:
    /// `let role = await prisma.role.findFirst({ where: { name: ROLES.Student, isActive: true } });
    /// if (!role) role = await prisma.role.create({ data: { name: ROLES.Student, description: "Student
    /// role" } });`. Returns the existing role's id on every call after the first for a given name;
    /// never creates a second active row for the same name.
    /// </summary>
    Task<string> EnsureRoleAsync(string roleName, CancellationToken cancellationToken = default);

    /// <summary>Signup's caller-supplied-roleId override path: `prisma.role.findFirst({ where: { id:
    /// roleId, isActive: true } })`. Returns null for an unknown/inactive role id -- the endpoint
    /// layer maps that to "Invalid role".</summary>
    Task<AdminRoleRow?> FindActiveRoleByIdAsync(string roleId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Persists the new signup user row. <paramref name="normalizedEmail"/> must already be
    /// normalized (trim+lowercase) by the caller, same caller-responsibility convention as Task 8's
    /// ChangeEmailAsync <c>newEmail</c> parameter. <paramref name="dateOfBirth"/> is the already-
    /// validated (13+, not-in-the-future) date of birth -- this method does not re-validate it.
    /// </summary>
    Task<CreatedAdminUserRow> CreateUserAsync(
        string name, string normalizedEmail, string passwordHash, string roleId, string roleName,
        DateTime dateOfBirth, CancellationToken cancellationToken = default);

    /// <summary>
    /// Upsert-by-userId for "user_settings"."marketingEmails", per authAdminService.ts's signup
    /// (`prisma.userSettings.upsert({ where: { userId }, create: { userId, marketingEmails:
    /// acceptMarketing }, update: { marketingEmails: acceptMarketing } })`) AND auth-admin.ts's
    /// unsubscribe handler (same upsert shape, always with <paramref name="marketingEmails"/> =
    /// false) -- ONE shared method backs both call sites, since both are literally the same upsert
    /// with a different boolean value.
    /// </summary>
    Task UpsertUserMarketingSettingsAsync(string userId, bool marketingEmails, CancellationToken cancellationToken = default);

    /// <summary>
    /// Mints and persists a new opaque refresh token for the just-created signup user -- same
    /// shape/table as Task 6's IAuthRepository.CreateRefreshTokenAsync (both write to
    /// "refresh_tokens"), duplicated here rather than cross-calling IAuthRepository so this endpoint
    /// group's only repository dependency is IAuthAdminRepository, matching this task's "separate
    /// repository" instruction.
    /// </summary>
    Task<string> CreateRefreshTokenAsync(string userId, string clientIp, CancellationToken cancellationToken = default);

    /// <summary>Target-user lookup for PUT /admin/set-password, per auth-admin.ts:211: `const user =
    /// await prisma.user.findUnique({ where: { email: email.toLowerCase() } });`. Returns null for an
    /// unknown email -- the endpoint layer maps that to 404 "Not found".</summary>
    Task<AdminTargetUserRow?> FindUserByEmailForAdminAsync(string normalizedEmail, CancellationToken cancellationToken = default);

    /// <summary>
    /// Live re-read of the CALLING admin's own "schoolId", per auth-admin.ts:214: `const admin =
    /// await prisma.user.findUnique({ where: { id: req.userId! }, select: { schoolId: true } });`.
    /// Deliberately a live DB lookup, NOT a read off the JWT-derived RequestContext.Tenant.SchoolId --
    /// this is the one place in this task that must NOT follow Task 12's JWT-trust convention, since
    /// legacy itself re-reads it here (unlike changePassword/changeEmail, which legacy also re-reads
    /// live but Task 12 deliberately chose to trust the JWT for instead). Returns null if the caller's
    /// own user row has no schoolId (or has vanished) -- the endpoint layer maps that to 403 "Not
    /// authorized", same as a schoolId mismatch.
    /// </summary>
    Task<string?> GetUserSchoolIdAsync(string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Sets a new password for a school user via the admin onboarding-bypass route, per
    /// auth-admin.ts:216-219: `await prisma.user.update({ where: { id: user.id }, data: { password:
    /// await hashPassword(password), onboardingToken: null, passwordNeedsMigration: false } });`. The
    /// caller (this task's endpoint handler) has already authorized the schoolId-scoping check and
    /// hashed the password before calling this -- this method trusts that already happened, same
    /// convention as IAuthRepository.UpdatePasswordAsync.
    /// </summary>
    Task SetPasswordForSchoolUserAsync(string userId, string passwordHash, CancellationToken cancellationToken = default);
}
