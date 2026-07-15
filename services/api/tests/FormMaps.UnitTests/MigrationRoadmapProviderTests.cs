using FormMaps.Application.Migration;

namespace FormMaps.UnitTests;

public class MigrationRoadmapProviderTests
{
    [Fact]
    public void GetRoadmap_includes_first_read_only_product_slice()
    {
        var provider = new MigrationRoadmapProvider();

        var roadmap = provider.GetRoadmap();

        Assert.Contains(roadmap, item => item.Domain == "reports-and-dashboards");
        Assert.Contains(roadmap, item => item.Status == "started");
    }
}
