namespace FormMaps.Application.Reports;

public sealed record SchoolBenchmarkReport(
    int TotalStudents,
    double AverageGpa,
    int PcaCompletionRate,
    double MilAverageScore,
    GpaDistribution GpaDistribution,
    DateTimeOffset GeneratedAt);
