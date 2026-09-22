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

/// <summary>
/// Domain 10 (Auth) admin-surface reads/writes backing routes/auth-admin.ts's two in-scope routes
/// (POST /signup, GET /unsubscribe) -- a SEPARATE repository/interface from
/// <see cref="IAuthRepository"/> per this task's plan, even though both ultimately touch the same
/// "users"/"roles"/"user_settings"/"refresh_tokens" tables as Tasks 6-12's IAuthRepository. Runs
/// entirely under <see cref="RequestContext.System"/>, because signup and unsubscribe are both
/// pre-auth public routes.
///
/// A third route, PUT /admin/set-password, was removed in 2026-09 along with the legacy handler it
/// was ported from: it reset another person's password without revoking their sessions, and its
/// `school:manage` guard did not mean what its "Super Admin only" comment claimed. The three
/// members that backed it (FindUserByEmailForAdminAsync, GetUserSchoolIdAsync,
/// SetPasswordForSchoolUserAsync) went with it -- a repository method that writes someone else's
/// password hash is not something to leave lying around unwired.
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
}
