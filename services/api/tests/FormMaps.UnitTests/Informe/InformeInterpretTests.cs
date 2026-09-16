using FormMaps.Application.Informe;

namespace FormMaps.UnitTests.Informe;

/// <summary>The interpretive library: band-keyed, bilingual, never throws.</summary>
public class InformeInterpretTests
{
    [Fact]
    public void Disc_interpretation_changes_with_the_band_and_exists_in_both_languages()
    {
        var high = InformeInterpret.Disc("D", 82, "es");
        var low = InformeInterpret.Disc("D", 20, "es");
        Assert.NotEmpty(high);
        Assert.NotEmpty(low);
        Assert.NotEqual(high, low);
        Assert.NotEmpty(InformeInterpret.Disc("C", 50, "en"));
    }

    [Fact]
    public void Cognitive_and_competence_lookups_resolve_and_unknown_keys_return_empty()
    {
        Assert.NotEmpty(InformeInterpret.Cognitive("razonamiento", 81, "en"));
        Assert.NotEmpty(InformeInterpret.Competence(4, "es"));
        Assert.Equal(string.Empty, InformeInterpret.Competence(5, "es"));
        Assert.Equal(string.Empty, InformeInterpret.Disc("X", 50, "es"));
        Assert.Equal(string.Empty, InformeInterpret.Cognitive("nope", 50, "es"));
    }

    [Fact]
    public void Glossary_carries_eleven_terms_including_the_two_engine_terms()
    {
        var es = InformeInterpret.Glossary("es");
        var en = InformeInterpret.Glossary("en");
        Assert.Equal(11, es.Count);
        Assert.Equal(11, en.Count);
        Assert.Contains(es, g => g.Term == "Puerta competencial");
        Assert.Contains(es, g => g.Term == "Convergencia");
        Assert.Contains(en, g => g.Term == "Competency gate");
        Assert.NotEmpty(InformeInterpret.Methodology("en"));
        Assert.Equal(11, InformeInterpret.Glossary("fr").Count);   // unknown language falls back to Spanish
    }
}
