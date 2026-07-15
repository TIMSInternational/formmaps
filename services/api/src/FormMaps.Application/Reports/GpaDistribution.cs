namespace FormMaps.Application.Reports;

public sealed record GpaDistribution(
    int Above35,
    int Above30,
    int Above25,
    int Below25);
