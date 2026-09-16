using FormMaps.Application.Informe;

namespace FormMaps.UnitTests.Informe;

/// <summary>
/// The engine's log register does not reach the student. These are the legacy renderer's
/// humanize.test.ts cases, byte for byte: the .NET passes must produce the same sentences the
/// TypeScript document printed.
/// </summary>
public class EngineProseTests
{
    [Fact]
    public void Humanize_lowers_gate_and_convergence_states_mid_sentence()
    {
        Assert.Equal(
            "Puerta competencial satisfecha. Convergencia divergente porque no se midieron Personalidad ni 360.",
            EngineProse.Humanize("Puerta competencial SATISFECHA. Convergencia DIVERGENTE porque no se midieron Personalidad ni 360."));
        Assert.Equal(
            "Puerta competencial crítica: Motivación (10) no aparece impresa en el informe PCA.",
            EngineProse.Humanize("Puerta competencial CRÍTICA: Motivación (10) no aparece impresa en el informe PCA."));
    }

    [Fact]
    public void Humanize_keeps_acronyms_alone_or_in_a_list()
    {
        Assert.Equal("Se midieron DISC, MIL y 13 de las 24 competencias.", EngineProse.Humanize("Se midieron DISC, MIL y 13 de las 24 competencias."));
        Assert.Equal("PCA del 18/10/2024 y MIL del 21/10/2024.", EngineProse.Humanize("PCA del 18/10/2024 y MIL del 21/10/2024."));
    }

    [Fact]
    public void Humanize_lowers_a_whole_shouted_phrase_and_capitalises_a_sentence_start()
    {
        Assert.Equal(
            "Sí está medido y es sólido. DISC completo. Falta: un PCA.",
            EngineProse.Humanize("SÍ ESTÁ MEDIDO Y ES SÓLIDO. DISC completo. FALTA: un PCA."));
        Assert.Equal(
            "Este informe no incluye recomendación de carrera, y es deliberado. El PCA disponible es breve.",
            EngineProse.Humanize("ESTE INFORME NO INCLUYE RECOMENDACIÓN DE CARRERA, Y ES DELIBERADO. El PCA disponible es breve."));
    }

    [Fact]
    public void Humanize_keeps_an_acronym_inside_a_shouted_phrase()
    {
        Assert.Equal("Perfil MIL compuesto alto.", EngineProse.Humanize("Perfil MIL COMPUESTO ALTO."));
    }

    [Fact]
    public void Humanize_lowers_a_single_shouted_word_and_leaves_ordinary_prose_alone()
    {
        Assert.Equal(
            "El orden de las familias es utilizable; el índice no puede superar parcial.",
            EngineProse.Humanize("El ORDEN de las familias es utilizable; el índice no puede superar PARCIAL."));
        Assert.Equal("Tu dominio más alto es Detección (96).", EngineProse.Humanize("Tu dominio más alto es Detección (96)."));
        Assert.Equal(string.Empty, EngineProse.Humanize(string.Empty));
        Assert.Equal(string.Empty, EngineProse.Humanize(null));
    }

    [Fact]
    public void Prose_collapses_soft_wraps_and_keeps_paragraph_breaks()
    {
        Assert.Equal("Línea uno línea dos.\n\nSegundo párrafo.", EngineProse.Prose("Línea uno\nlínea dos.\n\n\nSegundo   párrafo.\n"));
        Assert.Equal(string.Empty, EngineProse.Prose(null));
    }

    [Fact]
    public void EngineParagraphs_lifts_a_shouted_lead_in_into_a_sentence_case_heading()
    {
        var output = EngineProse.EngineParagraphs(
            "Basado en PCA y MIL.\n\nALCANCE. Se midieron DISC y MIL.\n\nSÍ ESTÁ MEDIDO Y ES SÓLIDO. DISC completo. FALTA: un PCA.");

        Assert.Equal(
            new[]
            {
                new EngineParagraph(null, "Basado en PCA y MIL."),
                new EngineParagraph("Alcance", "Se midieron DISC y MIL."),
                new EngineParagraph("Sí está medido y es sólido", "DISC completo. Falta: un PCA."),
            },
            output);
    }

    [Fact]
    public void EngineParagraphs_does_not_mistake_an_acronym_for_a_label()
    {
        Assert.Equal(new[] { new EngineParagraph(null, "PCA. Es el instrumento base.") }, EngineProse.EngineParagraphs("PCA. Es el instrumento base."));
    }

    [Fact]
    public void EngineParagraphs_collapses_hard_wraps_and_drops_empty_paragraphs()
    {
        Assert.Equal(new[] { new EngineParagraph("Alcance", "Línea uno línea dos.") }, EngineProse.EngineParagraphs("ALCANCE. Línea uno\nlínea dos.\n\n\n"));
        Assert.Empty(EngineProse.EngineParagraphs(string.Empty));
        Assert.Empty(EngineProse.EngineParagraphs(null));
    }

    [Fact]
    public void Teaser_is_the_first_sentence_cut_at_a_word_boundary()
    {
        Assert.Equal("Tu Influencia alta sostiene lo que esta familia premia.", EngineProse.Teaser("Tu Influencia alta sostiene lo que esta familia premia. Puerta competencial SATISFECHA."));
        var longSentence = "Su Facultad de Comunicación y Lenguaje es una de las más completas del país y el modelo de práctica temprana encaja con tu Influencia alta y tu necesidad de contacto con personas.";
        var teaser = EngineProse.Teaser(longSentence, 120);
        Assert.EndsWith("…", teaser, StringComparison.Ordinal);
        Assert.True(teaser.Length <= 121);
        Assert.DoesNotContain("rela…", teaser, StringComparison.Ordinal);
        Assert.Equal("Su Facultad de Comunicación y Lenguaje es una de las más completas del país y el modelo de práctica temprana encaja con…", teaser);
    }

    [Fact]
    public void SplitBridging_moves_a_verbatim_shared_string_out_of_the_cards_and_humanises_it()
    {
        const string shared = "Completar Personalidad y la evaluación 360 elevaría la convergencia por encima de DIVERGENTE.";
        var split = EngineProse.SplitBridging(
        [
            (true, shared),
            (true, shared),
            (false, shared),
            (true, "Cursar Cálculo I antes de inscribirte."),
        ]);

        Assert.Equal(new[] { new SharedSuggestion(shared.Replace("DIVERGENTE", "divergente", StringComparison.Ordinal), 2) }, split.Shared);
        Assert.Equal(new[] { false, false, false, true }, split.Inline);
    }

    [Fact]
    public void SplitBridging_leaves_unique_strings_inline_and_an_empty_list_untouched()
    {
        var split = EngineProse.SplitBridging([(true, "A."), (true, "B.")]);
        Assert.Empty(split.Shared);
        Assert.Equal(new[] { true, true }, split.Inline);

        var none = EngineProse.SplitBridging([]);
        Assert.Empty(none.Shared);
        Assert.Empty(none.Inline);
    }
}
