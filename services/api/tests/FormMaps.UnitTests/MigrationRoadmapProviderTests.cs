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

    // formmaps#12/#13: the roadmap used to be a hardcoded array that went stale (e.g. showing
    // "planned" for domains that had already shipped and cut over). It's now derived from
    // domain-status.manifest.json, so these tests pin the loader's behavior rather than any
    // particular hand-authored status string -- update the manifest, not this test, when a
    // domain's real status changes.
    [Fact]
    public void GetRoadmap_loads_every_domain_from_the_manifest_with_no_duplicates()
    {
        var provider = new MigrationRoadmapProvider();

        var roadmap = provider.GetRoadmap();

        Assert.NotEmpty(roadmap);
        Assert.Equal(roadmap.Count, roadmap.Select(item => item.Domain).Distinct().Count());
    }

    [Fact]
    public void GetRoadmap_reports_and_dashboards_is_no_longer_stale()
    {
        var provider = new MigrationRoadmapProvider();

        var roadmap = provider.GetRoadmap();
        var reports = Assert.Single(roadmap, item => item.Domain == "reports-and-dashboards");

        // The original hardcoded entry said "started"; all 7 report endpoints have been live in
        // prod since Wave 2 Batch 5 (2026-07-27).
        Assert.Equal("completed", reports.Status);
        Assert.True(reports.LiveInProd);
    }

    [Fact]
    public void GetRoadmap_distinguishes_code_complete_from_live_in_prod()
    {
        var provider = new MigrationRoadmapProvider();

        var roadmap = provider.GetRoadmap();
        var messaging = Assert.Single(roadmap, item => item.Domain == "messaging");

        // Domain 7b: code-complete and pushed 2026-07-31, but deliberately not deployed/flagged.
        // This is the exact case formmaps#13 asked the manifest to be able to represent.
        Assert.Equal("completed", messaging.Status);
        Assert.False(messaging.LiveInProd);
    }

    [Fact]
    public void GetRoadmap_every_entry_has_required_fields_populated()
    {
        var provider = new MigrationRoadmapProvider();

        var roadmap = provider.GetRoadmap();

        Assert.All(roadmap, item =>
        {
            Assert.False(string.IsNullOrWhiteSpace(item.Domain));
            Assert.False(string.IsNullOrWhiteSpace(item.CurrentOwner));
            Assert.False(string.IsNullOrWhiteSpace(item.TargetOwner));
            Assert.False(string.IsNullOrWhiteSpace(item.FirstMove));
            Assert.False(string.IsNullOrWhiteSpace(item.Risk));
            Assert.False(string.IsNullOrWhiteSpace(item.Status));
            Assert.False(string.IsNullOrWhiteSpace(item.LastVerified));
        });
    }
}
