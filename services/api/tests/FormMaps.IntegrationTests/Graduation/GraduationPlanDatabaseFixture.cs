using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Graduation;

/// <summary>
/// Testcontainers harness for the graduation-PLAN half of issue #55 (routes/graduation-plan.ts +
/// routes/counselor-graduation.ts), running the REAL production RLS policies as a NOSUPERUSER NOBYPASSRLS
/// login (formmaps#125).
///
/// <para>Nine of the fourteen tables here are policied, which is what makes the sabotage tests meaningful:
/// with a superuser login every app-layer predicate would look equally load-bearing because RLS would never
/// filter anything.</para>
///
/// <para>#135 DISCLOSURE: <c>student_course_plans</c> IS policied in production, by
/// <c>prisma/rls/pilot.sql</c>, which this harness does not vendor — so it is deliberately absent from
/// <see cref="PoliciedTables"/> and every student_course_plans assertion here proves the app-layer predicate
/// ONLY. That understates production, which is the safe direction, but it must not be re-read as "unpolicied
/// in production". <c>courses</c> and <c>universities</c> are different: those are global catalogs and carry
/// no policy in ANY file, here or in production.</para>
/// </summary>
public sealed class GraduationPlanDatabaseFixture : RlsEnabledDatabaseFixture
{
    protected override string SchemaResourceFileName => "graduation-plan-schema.sql";

    protected override IReadOnlyCollection<string> PoliciedTables =>
    [
        "users",
        "academic_years",
        "graduation_plans",
        "graduation_plan_items",
        "student_graduation_targets",
        "counselor_student_assignments",
        "student_parent_links",
        "notifications",
        "university_favorites",
        "user_preferences",
        "user_career_profiles",
        "course_enrollments",
    ];

    public Task ResetAsync() => TruncateAsync(
        "users", "academic_years", "graduation_plans", "graduation_plan_items", "student_graduation_targets",
        "counselor_student_assignments", "student_parent_links", "notifications", "university_favorites",
        "user_preferences", "user_career_profiles", "universities", "courses", "course_enrollments",
        "student_course_plans");

    // ---------------------------------------------------------------- seeding + assertions (admin connection)

    public async Task ExecuteAsync(string sql, params (string Name, object? Value)[] parameters)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        await command.ExecuteNonQueryAsync();
    }

    public async Task<T?> ScalarAsync<T>(string sql, params (string Name, object? Value)[] parameters)
    {
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        var result = await command.ExecuteScalarAsync();
        return result is null or DBNull ? default : (T)result;
    }

    public Task SeedUserAsync(string id, string? schoolId, string roleName = "Student", string name = "Student", int? gradeLevel = null) =>
        ExecuteAsync(
            """
            INSERT INTO "users" ("id", "name", "schoolId", "roleName", "gradeLevel")
            VALUES (@id, @name, @school, @role, @grade)
            """,
            ("id", id), ("name", name), ("school", schoolId), ("role", roleName), ("grade", gradeLevel));

    public Task SeedAcademicYearAsync(string id, string schoolId, bool isCurrent = true) =>
        ExecuteAsync(
            """
            INSERT INTO "academic_years" ("id", "schoolId", "name", "startDate", "endDate", "isCurrent")
            VALUES (@id, @school, '2025-2026', TIMESTAMP '2025-08-01 00:00:00', TIMESTAMP '2026-06-15 00:00:00', @current)
            """,
            ("id", id), ("school", schoolId), ("current", isCurrent));

    public Task SeedPlanAsync(
        string id, string studentId, string schoolId, string status = "draft",
        string templateKey = "engineering:selective", decimal totalCredits = 24.5m,
        string gapReport = "[]", bool isActive = true, DateTime? createdDate = null) =>
        ExecuteAsync(
            """
            INSERT INTO "graduation_plans"
                ("id", "studentId", "schoolId", "targetId", "templateKey", "status", "gapReport",
                 "totalPlannedCredits", "isActive", "createdDate")
            VALUES (@id, @student, @school, 'target-x', @tkey, @status, @gaps::jsonb, @credits, @active,
                    COALESCE(@created, CURRENT_TIMESTAMP))
            """,
            ("id", id), ("student", studentId), ("school", schoolId), ("tkey", templateKey), ("status", status),
            ("gaps", gapReport), ("credits", totalCredits), ("active", isActive), ("created", createdDate));

    public Task SeedPlanItemAsync(
        string id, string planId, string schoolId, string courseId, int gradeLevel,
        string? term = null, int sortOrder = 0, bool isActive = true, decimal credits = 1m) =>
        ExecuteAsync(
            """
            INSERT INTO "graduation_plan_items"
                ("id", "planId", "schoolId", "courseId", "courseCode", "courseName", "credits", "gradeLevel",
                 "term", "category", "source", "sortOrder", "isActive")
            VALUES (@id, @plan, @school, @course, @code, @name, @credits, @grade, @term, 'Science', 'engine',
                    @sort, @active)
            """,
            ("id", id), ("plan", planId), ("school", schoolId), ("course", courseId),
            ("code", $"CODE-{courseId}"), ("name", $"Course {courseId}"), ("credits", credits),
            ("grade", gradeLevel), ("term", term), ("sort", sortOrder), ("active", isActive));

    public Task SeedTargetAsync(
        string id, string studentId, string? schoolId, string major = "Engineering",
        string fieldKey = "engineering", string tier = "selective", bool isActive = true,
        string? universityId = null, string? universityName = null) =>
        ExecuteAsync(
            """
            INSERT INTO "student_graduation_targets"
                ("id", "studentId", "schoolId", "universityId", "universityName", "major", "fieldKey",
                 "selectivityTier", "templateKey", "isActive")
            VALUES (@id, @student, @school, @uniId, @uniName, @major, @field, @tier, @tkey, @active)
            """,
            ("id", id), ("student", studentId), ("school", schoolId), ("uniId", universityId),
            ("uniName", universityName), ("major", major), ("field", fieldKey), ("tier", tier),
            ("tkey", $"{fieldKey}:{tier}"), ("active", isActive));

    public Task SeedAssignmentAsync(string id, string counselorId, string studentId, bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "counselor_student_assignments" ("id", "counselorId", "studentId", "isActive")
            VALUES (@id, @counselor, @student, @active)
            """,
            ("id", id), ("counselor", counselorId), ("student", studentId), ("active", isActive));

    public Task SeedParentLinkAsync(
        string id, string studentId, string? parentUserId, bool isAccepted = true, bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "student_parent_links"
                ("id", "studentId", "parentEmail", "parentUserId", "isAccepted", "isActive")
            VALUES (@id, @student, @email, @parent, @accepted, @active)
            """,
            ("id", id), ("student", studentId), ("email", $"{id}@example.test"), ("parent", parentUserId),
            ("accepted", isAccepted), ("active", isActive));

    public Task SeedUniversityAsync(string id, string name, decimal? acceptanceRate) =>
        ExecuteAsync(
            """INSERT INTO "universities" ("id", "name", "acceptanceRate") VALUES (@id, @name, @rate)""",
            ("id", id), ("name", name), ("rate", acceptanceRate));

    public Task SeedFavoriteAsync(string id, string userId, string universityId, DateTime favoritedAt, bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "university_favorites" ("id", "userId", "universityId", "favoritedAt", "isActive")
            VALUES (@id, @user, @uni, @at, @active)
            """,
            ("id", id), ("user", userId), ("uni", universityId), ("at", favoritedAt), ("active", isActive));

    public Task SeedPreferencesAsync(string id, string userId, string[] targetCareers, string[] preferredFields) =>
        ExecuteAsync(
            """
            INSERT INTO "user_preferences" ("id", "userId", "targetCareers", "preferredFields")
            VALUES (@id, @user, @careers, @fields)
            """,
            ("id", id), ("user", userId), ("careers", targetCareers), ("fields", preferredFields));

    public Task SeedCareerProfileAsync(string id, string userId, string careerMatchesJson) =>
        ExecuteAsync(
            """
            INSERT INTO "user_career_profiles" ("id", "userId", "careerMatches")
            VALUES (@id, @user, @matches::jsonb)
            """,
            ("id", id), ("user", userId), ("matches", careerMatchesJson));

    public Task SeedGlobalCourseAsync(
        string id, string title, decimal rating = 0m, string category = "", string[]? skills = null,
        string[]? careerPaths = null, bool isActive = true, DateTime? createdDate = null) =>
        ExecuteAsync(
            """
            INSERT INTO "courses" ("id", "title", "provider", "category", "rating", "skills", "careerPaths",
                                   "isActive", "createdDate")
            VALUES (@id, @title, 'Coursera', @category, @rating, @skills, @paths, @active,
                    COALESCE(@created, CURRENT_TIMESTAMP))
            """,
            ("id", id), ("title", title), ("category", category), ("rating", rating),
            ("skills", skills ?? []), ("paths", careerPaths ?? []), ("active", isActive), ("created", createdDate));

    public Task SeedEnrollmentAsync(string id, string courseId, string studentId, bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "course_enrollments" ("id", "courseId", "studentId", "isActive")
            VALUES (@id, @course, @student, @active)
            """,
            ("id", id), ("course", courseId), ("student", studentId), ("active", isActive));

    public Task SeedCoursePlanAsync(
        string id, string studentId, string schoolId, string academicYearId, string courseId,
        int? gradeLevel = null, bool isActive = true) =>
        ExecuteAsync(
            """
            INSERT INTO "student_course_plans"
                ("id", "studentId", "schoolId", "academicYearId", "courseId", "gradeLevel", "isActive")
            VALUES (@id, @student, @school, @ay, @course, @grade, @active)
            """,
            ("id", id), ("student", studentId), ("school", schoolId), ("ay", academicYearId),
            ("course", courseId), ("grade", gradeLevel), ("active", isActive));
}
