namespace FormMaps.Application.Reports;

public sealed record UserReport(
    UserReportStudent Student,
    UserReportAcademic Academic,
    UserReportAssessments Assessments,
    UserReportCourses Courses,
    DateTimeOffset GeneratedAt);

public sealed record UserReportStudent(
    string Id,
    string Name,
    string? Email,
    int? GradeLevel,
    DateTimeOffset JoinedAt);

public sealed record UserReportAcademic(
    double? Gpa,
    double CreditsEarned,
    int TotalGrades);

public sealed record UserReportAssessments(
    UserReportPca Pca,
    UserReportMil Mil,
    UserReportEvaluation360 Evaluation360);

public sealed record UserReportPca(
    bool Completed,
    int Count);

public sealed record UserReportMil(
    int CompletedExams,
    int TotalExams,
    double AverageScore);

public sealed record UserReportEvaluation360(
    int Total,
    int Completed);

public sealed record UserReportCourses(
    int Enrolled,
    int Completed);
