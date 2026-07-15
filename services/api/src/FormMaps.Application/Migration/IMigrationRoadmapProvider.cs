namespace FormMaps.Application.Migration;

public interface IMigrationRoadmapProvider
{
    IReadOnlyList<MigrationDomainStatus> GetRoadmap();
}
