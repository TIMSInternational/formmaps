using FormMaps.Application.Common;
using FormMaps.Domain.Common;

namespace FormMaps.UnitTests;

public class ScaffoldTests
{
    [Fact]
    public void Core_layer_markers_are_available()
    {
        Assert.Equal("DomainAssemblyMarker", nameof(DomainAssemblyMarker));
        Assert.Equal("ApplicationAssemblyMarker", nameof(ApplicationAssemblyMarker));
    }
}
