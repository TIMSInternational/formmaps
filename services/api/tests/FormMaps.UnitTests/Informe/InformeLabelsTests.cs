using FormMaps.Application.Informe;

namespace FormMaps.UnitTests.Informe;

/// <summary>The bilingual label dictionary: key parity, never-throws lookup, template filling.</summary>
public class InformeLabelsTests
{
    [Fact]
    public void Es_and_en_have_identical_key_sets()
    {
        var es = InformeLabels.All("es").Keys.Order(StringComparer.Ordinal).ToList();
        var en = InformeLabels.All("en").Keys.Order(StringComparer.Ordinal).ToList();
        Assert.Equal(es, en);
        Assert.True(es.Count >= 200, $"expected the full dictionary, got {es.Count} keys");
    }

    [Fact]
    public void Known_labels_round_trip_from_the_legacy_dictionary()
    {
        Assert.Equal("Alta", InformeLabels.Get("es", "band.high"));
        Assert.Equal("High", InformeLabels.Get("en", "band.high"));
        Assert.Equal("Medición de Inteligencia Laboral (MIL)", InformeLabels.Get("es", "section.lia.title"));
        Assert.Equal("Personal Competence Analysis (PCA)", InformeLabels.Get("en", "section.disc.title"));
        Assert.Equal("—", InformeLabels.Get("es", "empty.value"));
    }

    [Fact]
    public void A_missing_key_returns_the_key_and_an_unknown_language_falls_back_to_spanish()
    {
        Assert.Equal("unknown.key", InformeLabels.Get("es", "unknown.key"));
        Assert.Equal("Alta", InformeLabels.Get("fr", "band.high"));
    }

    [Fact]
    public void Fmt_fills_placeholders_and_leaves_unmatched_ones_verbatim()
    {
        var kicker = InformeLabels.Fmt(
            InformeLabels.Get("es", "run.kicker"),
            new Dictionary<string, object?> { ["part"] = "PARTE 2 · CARRERAS", ["section"] = "Carreras recomendadas" });
        Assert.Equal("PARTE 2 · CARRERAS — Carreras recomendadas (cont.)", kicker);

        var summary = InformeLabels.Fmt(
            InformeLabels.Get("es", "mil.summary"),
            new Dictionary<string, object?> { ["high"] = "Detección", ["highV"] = 96, ["low"] = "Numérico", ["lowV"] = 55, ["comp"] = 72, ["band"] = "Alta" });
        Assert.Equal("Tu dominio más alto es Detección (96) y el más bajo, Numérico (55). Tu compuesto, 72, está en la banda Alta.", summary);

        Assert.Equal("a {missing} b", InformeLabels.Fmt("a {missing} b", new Dictionary<string, object?>()));
    }
}
