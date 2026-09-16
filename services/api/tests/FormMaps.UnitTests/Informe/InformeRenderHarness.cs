using FormMaps.Application.Informe;
using FormMaps.Application.Informe.Sections;

namespace FormMaps.UnitTests.Informe;

/// <summary>
/// Renders the fixtures end to end and asserts they are clean — and, when INFORME_RENDER_OUT names a
/// directory, leaves the PDFs there to be looked at.
///
/// The legacy repository kept render harnesses beside the informe for the same reason: containment is
/// asserted, but typography is judged, and the port is verified by putting a rendered page beside the
/// production document. Setting the variable is how a page gets compared:
///
///     INFORME_RENDER_OUT=/tmp/informe dotnet test --filter FullyQualifiedName~InformeRenderHarness
/// </summary>
public class InformeRenderHarness
{
    public static TheoryData<string, bool> Cases => new() { { "es", false }, { "en", false }, { "es", true }, { "en", true } };

    [Theory]
    [MemberData(nameof(Cases))]
    public void Renders_the_first_two_pages_cleanly(string lang, bool sparse)
    {
        var spanish = lang == "es";
        var vm = sparse ? InformeFixtures.Sparse() : InformeFixtures.Complete(InformeFixtures.LongName);
        var contents = sparse ? InformeFixtures.ContentsWithPending(spanish) : InformeFixtures.Contents(spanish);

        using var canvas = new InformeCanvas();
        InformeCover.Render(canvas, vm, lang);
        InformeFrontPage.Render(canvas, vm, lang, contents);
        var pdf = canvas.Save();

        Assert.Equal(string.Empty, Containment.Describe(Containment.FindAll(canvas.Recording)));
        Assert.Equal(2, canvas.PageCount);

        var directory = Environment.GetEnvironmentVariable("INFORME_RENDER_OUT");
        if (!string.IsNullOrWhiteSpace(directory) && Directory.Exists(directory))
        {
            File.WriteAllBytes(Path.Combine(directory, $"informe-slice1-{lang}-{(sparse ? "sparse" : "complete")}.pdf"), pdf);
        }
    }
}
