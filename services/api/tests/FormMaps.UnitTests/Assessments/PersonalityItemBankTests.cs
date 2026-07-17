using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins the embedded personality item bank (extracted from legacy personality-items.data.ts): the
/// counts + field integrity, the localize/serve behavior, and the ANSWER-KEY NON-LEAK invariant (served
/// items never carry poles) — the security-parity contract from personality-bank.ts serveItems.
/// </summary>
public class PersonalityItemBankTests
{
    private static readonly HashSet<string> Dimensions = ["EI", "SN", "TF", "JP"];
    private static readonly HashSet<string> APoles = ["E", "S", "T", "J"];
    private static readonly HashSet<string> BPoles = ["I", "N", "F", "P"];

    [Theory]
    [InlineData("laboral", 40)]
    [InlineData("estudiantil", 80)]
    public void Variant_item_counts_match_the_legacy_bank(string variant, int expected)
    {
        Assert.Equal(expected, PersonalityItemBank.GetVariantItems(variant).Count);
        Assert.Equal(expected, PersonalityItemBank.ItemCount(variant));
    }

    [Fact]
    public void Unknown_variant_throws()
    {
        Assert.Throws<InvalidOperationException>(() => PersonalityItemBank.GetVariantItems("bogus"));
    }

    [Theory]
    [InlineData("laboral")]
    [InlineData("estudiantil")]
    public void Every_item_has_valid_dimensions_poles_sequential_numbers_and_bilingual_text(string variant)
    {
        var items = PersonalityItemBank.GetVariantItems(variant);
        var n = 0;
        foreach (var item in items)
        {
            Assert.Equal(++n, item.N); // sequential 1..count
            Assert.Contains(item.Dimension, Dimensions);
            Assert.Contains(item.OptionAPole, APoles); // A pole in {E,S,T,J}
            Assert.Contains(item.OptionBPole, BPoles); // B pole in {I,N,F,P}
            Assert.False(string.IsNullOrWhiteSpace(item.PromptEs));
            Assert.False(string.IsNullOrWhiteSpace(item.PromptEn));
            Assert.False(string.IsNullOrWhiteSpace(item.OptionAEs));
            Assert.False(string.IsNullOrWhiteSpace(item.OptionBEn));
        }
    }

    [Fact]
    public void ServeItems_drops_the_poles_answer_key()
    {
        var served = PersonalityItemBank.ServeItems("laboral", "es");
        Assert.Equal(40, served.Count);

        // Structurally there is no pole field; also prove it survives serialization — the taking screen
        // must never receive optionA_pole / optionB_pole.
        var json = JsonSerializer.Serialize(served[0]);
        Assert.DoesNotContain("pole", json, StringComparison.OrdinalIgnoreCase);
        using var document = JsonDocument.Parse(json);
        var keys = document.RootElement.EnumerateObject().Select(p => p.Name).ToHashSet();
        Assert.Equal(new HashSet<string> { "n", "dimension", "prompt", "optionA", "optionB" }, keys);
    }

    [Fact]
    public void ServeItems_localizes_prompt_and_options()
    {
        var raw = PersonalityItemBank.GetVariantItems("estudiantil")[0];
        var es = PersonalityItemBank.ServeItems("estudiantil", "es")[0];
        var en = PersonalityItemBank.ServeItems("estudiantil", "en")[0];

        Assert.Equal(raw.PromptEs, es.Prompt);
        Assert.Equal(raw.OptionAEs, es.OptionA);
        Assert.Equal(raw.PromptEn, en.Prompt);
        Assert.Equal(raw.OptionBEn, en.OptionB);
        // Any non-"en" language falls back to Spanish (legacy: language === "en" ? en : es).
        Assert.Equal(raw.PromptEs, PersonalityItemBank.ServeItems("estudiantil", "fr")[0].Prompt);
    }

    [Fact]
    public void FindItem_returns_the_server_derived_dimension_or_null()
    {
        var item = PersonalityItemBank.FindItem("laboral", 1);
        Assert.NotNull(item);
        Assert.Equal(PersonalityItemBank.GetVariantItems("laboral")[0].Dimension, item!.Dimension);

        Assert.Null(PersonalityItemBank.FindItem("laboral", 0));   // below range
        Assert.Null(PersonalityItemBank.FindItem("laboral", 999)); // above range
    }
}
