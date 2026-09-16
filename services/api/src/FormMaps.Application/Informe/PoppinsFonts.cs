using System.Reflection;

namespace FormMaps.Application.Informe;

// Poppins is the informe's only typeface and is embedded in this assembly (SIL OFL
// 1.1, redistributable), because the container the renderer runs in has no fonts
// installed. Renderer-agnostic on purpose: this hands out bytes and face names, and
// knows nothing about PDFsharp — the resolver that plugs these into a renderer lives
// with the renderer.

/// <summary>The four Poppins faces the document uses, by the names the type scale refers to.</summary>
public static class PoppinsFonts
{
    /// <summary>Face name → embedded file name.</summary>
    public static IReadOnlyDictionary<string, string> Faces { get; } = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["Poppins-Regular"] = "Poppins-Regular.ttf",
        ["Poppins-Medium"] = "Poppins-Medium.ttf",
        ["Poppins-SemiBold"] = "Poppins-SemiBold.ttf",
        ["Poppins-Bold"] = "Poppins-Bold.ttf",
    };

    /// <summary>The raw TTF bytes of one face. Throws for a face this document does not use.</summary>
    public static byte[] Load(string faceName)
    {
        if (!Faces.TryGetValue(faceName, out var file))
        {
            throw new ArgumentOutOfRangeException(nameof(faceName), faceName, $"Not an informe face; expected one of {string.Join(", ", Faces.Keys)}.");
        }

        var assembly = typeof(PoppinsFonts).Assembly;
        var resource = assembly.GetManifestResourceNames().Single(n => n.EndsWith("." + file, StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(resource)!;
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return buffer.ToArray();
    }
}
