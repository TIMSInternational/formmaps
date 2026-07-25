using System.Text.Json;
using System.Text.Json.Nodes;

namespace FormMaps.Application.Resumes;

/// <summary>
/// Pure manipulation of the resume <c>sections</c> jsonb array (FM-DOTNET-089), mirroring the routes/resume.ts
/// operations exactly. Legacy treats a null/non-array <c>sections</c> as <c>[]</c> (<c>(resume.sections as []) ||
/// []</c>); each op re-serializes the array back to jsonb. Section elements are objects with a string <c>id</c>.
/// </summary>
public static class ResumeSections
{
    // POST /:id/sections allowedTypes — anything else coalesces to "custom".
    private static readonly string[] AllowedTypes =
        ["custom", "experience", "education", "skills", "certifications", "projects", "awards", "languages", "volunteer", "references"];

    /// <summary>
    /// body.sectionOrder must be an array (Array.isArray). Returns false when it is absent/non-array (→ the 400).
    /// The extracted order keeps only string elements — non-strings can never `=== ` a string section id, so
    /// dropping them is equivalent to legacy's map(find).filter(Boolean).
    /// </summary>
    public static bool TryReadSectionOrder(JsonElement body, out IReadOnlyList<string> order)
    {
        order = [];
        if (body.ValueKind != JsonValueKind.Object
            || !body.TryGetProperty("sectionOrder", out var value)
            || value.ValueKind != JsonValueKind.Array)
        {
            return false;
        }

        var list = new List<string>();
        foreach (var element in value.EnumerateArray())
        {
            if (element.ValueKind == JsonValueKind.String)
            {
                list.Add(element.GetString()!);
            }
        }

        order = list;
        return true;
    }

    /// <summary>
    /// Build the new section object exactly as legacy: <c>type = allowedTypes.includes(body.type) ? body.type :
    /// "custom"</c>; <c>title = typeof body.title === "string" ? body.title.slice(0,200) : "New Section"</c>;
    /// <c>items = Array.isArray(body.items) ? body.items.slice(0,100) : []</c>; plus the caller-supplied id.
    /// </summary>
    public static string BuildSection(JsonElement body, string id)
    {
        var type = "custom";
        if (TryGetProp(body, "type", out var typeNode) && typeNode.ValueKind == JsonValueKind.String
            && AllowedTypes.Contains(typeNode.GetString()))
        {
            type = typeNode.GetString()!;
        }

        var title = "New Section";
        if (TryGetProp(body, "title", out var titleNode) && titleNode.ValueKind == JsonValueKind.String)
        {
            var raw = titleNode.GetString()!;
            title = raw.Length > 200 ? raw[..200] : raw;
        }

        var items = new JsonArray();
        if (TryGetProp(body, "items", out var itemsNode) && itemsNode.ValueKind == JsonValueKind.Array)
        {
            var count = 0;
            foreach (var element in itemsNode.EnumerateArray())
            {
                if (count++ >= 100)
                {
                    break;
                }

                items.Add(JsonNode.Parse(element.GetRawText()));
            }
        }

        var section = new JsonObject { ["id"] = id, ["type"] = type, ["title"] = title, ["items"] = items };
        return section.ToJsonString();
    }

    private static bool TryGetProp(JsonElement body, string name, out JsonElement value)
    {
        value = default;
        return body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out value);
    }

    /// <summary>
    /// reorder: <c>sectionOrder.map(id =&gt; sections.find(s =&gt; s.id === id)).filter(Boolean)</c> — for each id in
    /// order, take the first section whose id matches; ids with no match are dropped, and sections NOT named in the
    /// order are dropped too (faithful to legacy, which can shrink the array).
    /// </summary>
    public static string Reorder(string? sectionsJson, IReadOnlyList<string> sectionOrder)
    {
        var sections = ParseArray(sectionsJson);
        var result = new JsonArray();
        foreach (var id in sectionOrder)
        {
            var match = FindById(sections, id);
            if (match is not null)
            {
                result.Add(match.DeepClone());
            }
        }

        return result.ToJsonString();
    }

    /// <summary>
    /// Legacy does <c>(resume.sections as Array) || []</c> then <c>.map/.push/.filter</c>. A TRUTHY NON-array value
    /// (an object, a non-empty string, a non-zero number, or true) makes those array methods throw → the route's
    /// catch → 500. A falsy value (null / "" / 0 / false) coalesces to <c>[]</c> with no error. Returns true only for
    /// the throwing case, so the reorder/add/delete ops can reproduce the 500 (a corrupt sections jsonb is reachable
    /// via the Node create/update, which stay polyglot). Template writes never read sections, so they don't call this.
    /// </summary>
    public static bool IsCorruptSections(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        JsonNode? node;
        try
        {
            node = JsonNode.Parse(json);
        }
        catch (JsonException)
        {
            return false; // unparseable → legacy would have a null/[] (defensive; the column is app-controlled JSON)
        }

        return node switch
        {
            null => false,                            // jsonb 'null'
            JsonArray => false,                        // the normal case
            JsonValue value => !IsFalsy(value),        // "" / 0 / false → [] (no throw); else → throw
            _ => true,                                 // object → throw
        };
    }

    private static bool IsFalsy(JsonValue value)
    {
        if (value.TryGetValue<bool>(out var b))
        {
            return !b;
        }

        if (value.TryGetValue<string>(out var s))
        {
            return s.Length == 0;
        }

        if (value.TryGetValue<double>(out var d))
        {
            return d == 0;
        }

        return false;
    }

    /// <summary>Append a fully-built section object to the array.</summary>
    public static string Append(string? sectionsJson, string newSectionJson)
    {
        var sections = ParseArray(sectionsJson);
        sections.Add(JsonNode.Parse(newSectionJson));
        return sections.ToJsonString();
    }

    /// <summary>Remove every section whose <c>id</c> equals <paramref name="sectionId"/> (legacy filter s.id !== id).</summary>
    public static string Delete(string? sectionsJson, string sectionId)
    {
        var sections = ParseArray(sectionsJson);
        var result = new JsonArray();
        foreach (var node in sections)
        {
            if (IdOf(node) != sectionId)
            {
                result.Add(node?.DeepClone());
            }
        }

        return result.ToJsonString();
    }

    // (resume.sections as Array) || [] — null/non-array → []. A parse failure is likewise treated as [] (the column
    // defaults to [] and is app-controlled, so this is defensive, not a live path).
    private static JsonArray ParseArray(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonNode.Parse(json) as JsonArray ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static JsonNode? FindById(JsonArray sections, string id)
    {
        foreach (var node in sections)
        {
            if (IdOf(node) == id)
            {
                return node;
            }
        }

        return null;
    }

    // s.id — only a matching string id compares equal (JS === ). A missing/non-string id never equals a string id.
    private static string? IdOf(JsonNode? node) =>
        node is JsonObject obj && obj.TryGetPropertyValue("id", out var idNode) && idNode is JsonValue value
            && value.TryGetValue<string>(out var id)
            ? id
            : null;
}
