using FormMaps.Application.Informe;
using FormMaps.Application.Informe.Sections;

namespace FormMaps.UnitTests.Informe;

/// <summary>
/// Fictional view models to render from.
///
/// INVENTED PEOPLE ONLY. Every render the design was verified on came from a hand-built view model,
/// and the two students whose reports were reviewed are real; nothing about them belongs in this
/// repository. These two fixtures are the shapes that matter — everything measured, and nothing
/// measured — because the second is where the empty-state grammar has to hold and where the legacy
/// renderer printed its worst defect over data that did not exist.
/// </summary>
public static class InformeFixtures
{
    /// <summary>A deliberately long name: the cover drew one like this at a flat 22pt and ran it off the page.</summary>
    public const string LongName = "María Valentina Rodríguez Bustamante-Peralta";

    /// <summary>Everything measured.</summary>
    public static InformeViewModel Complete(string? name = null) => new(
        Student: new InformeStudent("stu-fixture-1", name ?? "Valeria Ocampo Restrepo", "Colegio Ejemplo de Pruebas", "11°", "valeria@ejemplo.test"),
        GeneratedAt: new DateTimeOffset(2026, 9, 16, 12, 0, 0, TimeSpan.Zero),
        Profile: new InformeProfile(
            Disc: new DiscMatrix(
                new DiscGraph(72, 58, 41, 63),
                new DiscGraph(80, 44, 35, 70),
                new DiscGraph(66, 61, 48, 59),
                new DiscGraph(80, 44, 35, 70)),
            Cognitive: new CognitiveProfile(
                new MilScores(74, 68, 59, 81, 63),
                new MilComposite(69.0, 71.2, "Alto")),
            Competences: [new Competence("Adaptabilidad al Cambio", 3), new Competence("Pensamiento Analítico", 4), new Competence("Trabajo en Equipo", 2)],
            Interests: ["Ciencia de datos", "Biotecnología", "Diseño de producto"],
            Motivators: ["Autonomía", "Aprendizaje", "Impacto"],
            Academics: new AcademicsSnapshot(4.3, 1380, 30, 3, 4, 0, 32, new ActivitiesSnapshot(6, 2, true)),
            ProfileSummary: "Perfil analítico con fuerte orientación a resultados.",
            ThreeSixty: new ThreeSixtySummary(new Dictionary<string, double> { ["Comunicación"] = 4.2, ["Liderazgo"] = 3.8 }, 5)),
        Careers: [],
        Clusters: [],
        Universities: [],
        Fingerprint: "fixture-complete",
        Personality: new InformePersonality("ENFJ", "estudiantil", new Dictionary<string, PersonalityDimension>
        {
            ["EI"] = new("E", 62, false),
            ["SN"] = new("N", 71, false),
            ["TF"] = new("F", 55, false),
            ["JP"] = new("J", 68, false),
        }),
        Coverage: new InformeCoverage(
            Pca: new InstrumentCoverage(true, "2026-08-30"),
            Mil: new InstrumentCoverage(true, "2026-09-02"),
            Competencias: new CompetencyCoverage(true, 24, 24, null, "2026-08-30"),
            Personalidad: new InstrumentCoverage(true, "2026-09-05"),
            ThreeSixty: new ThreeSixtyCoverage(true, 5),
            Academico: new InstrumentCoverage(true),
            Universidades: new InstrumentCoverage(true),
            Careers: new CareersCoverage(true)),
        Scoring: new InformeScoring("careerfit", [new ScoringFactor("disc", "Personalidad", null, true)]));

    /// <summary>
    /// Nothing measured. The cover must name no instrument at all rather than the old static
    /// "PCA · LIA · 360°", which printed 360° on reports whose 360 had never been answered.
    /// </summary>
    public static InformeViewModel Sparse() => new(
        Student: new InformeStudent("stu-fixture-2", "Andrés Felipe Quintero", null, null),
        GeneratedAt: new DateTimeOffset(2026, 9, 16, 12, 0, 0, TimeSpan.Zero),
        Profile: new InformeProfile(
            Disc: null,
            Cognitive: new CognitiveProfile(new MilScores(0, 0, 0, 0, 0), new MilComposite(0, 0, "")),
            Competences: null,
            Interests: [],
            Motivators: [],
            Academics: null,
            ProfileSummary: "",
            ThreeSixty: new ThreeSixtySummary(new Dictionary<string, double>(), 0)),
        Careers: [],
        Clusters: [],
        Universities: [],
        Fingerprint: "fixture-sparse",
        Personality: null,
        Coverage: new InformeCoverage(
            Pca: new InstrumentCoverage(false),
            Mil: new InstrumentCoverage(false),
            Competencias: new CompetencyCoverage(false, 0, 24),
            Personalidad: new InstrumentCoverage(false),
            ThreeSixty: new ThreeSixtyCoverage(false, 0),
            Academico: new InstrumentCoverage(false),
            Universidades: new InstrumentCoverage(false),
            Careers: new CareersCoverage(false, "No hay evaluaciones suficientes para ordenar carreras.")),
        Scoring: null);

    /// <summary>A contents list the shape of the real one: parts at level 0, sections at level 1.</summary>
    public static IReadOnlyList<TocEntry> Contents(bool spanish = true) => spanish
        ?
        [
            new TocEntry("part1", "PARTE 1 · QUIÉN ERES", 0),
            new TocEntry("resumen", "Resumen ejecutivo", 1),
            new TocEntry("disc", "Tu estilo de comportamiento (DISC)", 1),
            new TocEntry("estilo", "Cómo se traduce en el día a día", 1),
            new TocEntry("personality", "Tu tipo de personalidad", 1),
            new TocEntry("lia", "Capacidad cognitiva (MIL)", 1),
            new TocEntry("competencias", "Competencias evaluadas", 1),
            new TocEntry("threeSixty", "Cómo te ven los demás (360°)", 1),
            new TocEntry("part2", "PARTE 2 · HACIA DÓNDE", 0),
            new TocEntry("intereses", "Intereses y motivadores", 1),
            new TocEntry("carreras", "Carreras recomendadas", 1),
            new TocEntry("universidades", "Universidades sugeridas", 1),
            new TocEntry("plan", "Tu plan de acción", 1),
            new TocEntry("glosario", "Glosario", 1),
        ]
        :
        [
            new TocEntry("part1", "PART 1 · WHO YOU ARE", 0),
            new TocEntry("resumen", "Executive summary", 1),
            new TocEntry("disc", "Your behavioural style (DISC)", 1),
            new TocEntry("estilo", "How it shows up day to day", 1),
            new TocEntry("personality", "Your personality type", 1),
            new TocEntry("lia", "Cognitive ability (MIL)", 1),
            new TocEntry("competencias", "Competences assessed", 1),
            new TocEntry("threeSixty", "How others see you (360°)", 1),
            new TocEntry("part2", "PART 2 · WHERE TO", 0),
            new TocEntry("intereses", "Interests and motivators", 1),
            new TocEntry("carreras", "Recommended careers", 1),
            new TocEntry("universidades", "Suggested universities", 1),
            new TocEntry("plan", "Your action plan", 1),
            new TocEntry("glosario", "Glossary", 1),
        ];

    /// <summary>The same contents with the second part still outstanding — the pending rows the empty-state grammar draws in grey.</summary>
    public static IReadOnlyList<TocEntry> ContentsWithPending(bool spanish = true) =>
        [.. Contents(spanish).Select(e => e.Id is "part2" or "carreras" or "universidades" or "plan" ? e with { Pending = true } : e)];
}
