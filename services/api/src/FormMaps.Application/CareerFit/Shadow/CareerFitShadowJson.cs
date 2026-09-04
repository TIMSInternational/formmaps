using System.Text;
using System.Text.Json;

namespace FormMaps.Application.CareerFit.Shadow;

// FM-CF-013. The three jsonb shapes a shadow row persists (infra/aws/sql/careerfit-shadow-tables.sql),
// produced here and nowhere else, under the same snake_case convention CareerFitRunJson's audit half
// uses so the two documents read alike.
//
// WHY THERE IS NO PARSER HERE, unlike CareerFitRunJson. Nothing in the product reads a shadow row back:
// no endpoint serves the table (FM-CF-012 mapped seven routes and none of them is this), and the report
// generator consumes a psql export of the row's own jsonb rather than a .NET projection of it. Adding a
// parser would be adding an unexercised inverse — the thing this repo's tests exist to catch. If a
// reader ever appears, it belongs beside CareerFitRunJson.ParseInputQuality, written with its
// round-trip test.
//
// WHAT IS IN THE DOCUMENTS AND WHAT IS NOT. Both rankings carry the family id, the rank, the evidence
// count and the tie flag — enough to re-derive the metrics by hand from the row. The disagreements
// carry the cause and the sentence that names the specific evidence. What is NOT here is any legacy
// programme title or id: they are catalogue rows from a system this table does not model, they would
// make a shadow row a partial copy of the legacy catalogue, and a disagreement is traced through the
// RUN, which the row points at.

/// <summary>Serialisers for the jsonb columns of a shadow comparison.</summary>
public static class CareerFitShadowJson
{
    /// <summary>One side's family ranking: <c>[{family_id, rank, evidence, tied}]</c> in rank order.</summary>
    public static string SerializeRanking(IReadOnlyList<ShadowRankedFamily> ranking)
    {
        ArgumentNullException.ThrowIfNull(ranking);
        return Write(writer =>
        {
            writer.WriteStartArray();
            foreach (var family in ranking)
            {
                writer.WriteStartObject();
                writer.WriteNumber("family_id", family.FamilyId);
                if (family.Rank is int rank)
                {
                    writer.WriteNumber("rank", rank);
                }
                else
                {
                    writer.WriteNull("rank");
                }

                writer.WriteNumber("evidence", family.Evidence);
                writer.WriteBoolean("tied", family.Tied);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
        });
    }

    /// <summary>
    /// The delta half of the row: the classified disagreements, plus the two lists that explain the
    /// comparison's own limits — the legacy clusters the projection does not assign (the work list for
    /// completing it) and the instruments that contributed a constant to every family (the caveat that
    /// applies to every number in the report).
    /// </summary>
    public static string SerializeDelta(CareerFitShadowComparison comparison)
    {
        ArgumentNullException.ThrowIfNull(comparison);
        return Write(writer =>
        {
            writer.WriteStartObject();

            writer.WriteStartArray("disagreements");
            foreach (var disagreement in comparison.Disagreements)
            {
                writer.WriteStartObject();
                writer.WriteNumber("family_id", disagreement.FamilyId);
                WriteNullableNumber(writer, "engine_rank", disagreement.EngineRank);
                WriteNullableNumber(writer, "legacy_rank", disagreement.LegacyRank);
                WriteNullableNumber(writer, "rank_delta", disagreement.RankDelta);
                writer.WriteString("cause", disagreement.Cause.ToPersistedValue());
                writer.WriteString("explanation", disagreement.Explanation);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();

            writer.WriteStartArray("unmapped_clusters");
            foreach (var cluster in comparison.UnmappedClusters)
            {
                writer.WriteStringValue(cluster);
            }

            writer.WriteEndArray();

            writer.WriteStartArray("uniformly_deflated_instruments");
            foreach (var instrument in comparison.UniformlyDeflatedInstruments)
            {
                writer.WriteStringValue(instrument);
            }

            writer.WriteEndArray();

            if (comparison.Note is { Length: > 0 } note)
            {
                writer.WriteString("note", note);
            }

            // Restated inside the document as well as in its own column: an export of the jsonb alone
            // (which is how the report generator reads a row) must be self-describing about which
            // comparator and which projection produced it.
            writer.WriteString("comparator_version", comparison.ComparatorVersion);
            writer.WriteString("projection_version", comparison.ProjectionVersion);
            writer.WriteEndObject();
        });
    }

    private static void WriteNullableNumber(Utf8JsonWriter writer, string name, int? value)
    {
        if (value is int number)
        {
            writer.WriteNumber(name, number);
        }
        else
        {
            writer.WriteNull(name);
        }
    }

    private static string Write(Action<Utf8JsonWriter> body)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            body(writer);
        }

        return Encoding.UTF8.GetString(buffer.ToArray());
    }
}
