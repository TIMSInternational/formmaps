using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.IsamsWrites;

/// <summary>
/// iSAMS integration CONFIGURE write (FM-DOTNET-087 — routes/school.ts POST /integrations/isams →
/// schoolService.configureIsams). The ONLY iSAMS write ported to .NET: it is a self-contained
/// <c>isamsConfig</c> upsert plus AES-256-GCM credential encryption. The <c>sync</c> and <c>test</c> writes stay
/// in Node — they wrap the SSRF-hardened undici vendor client (per-socket DNS re-validation + rebind /
/// cloud-metadata blocking) and <c>sync</c> creates user rows, the same cohesive vendor+side-effect boundary that
/// kept invites (FM-067/068) and calendar-sync (FM-071) polyglot. status + jobs reads are FM-053.
/// </summary>
public interface IIsamsConfigWriter
{
    Task<ConfigureIsamsResult> ConfigureAsync(
        RequestContext context, string schoolId, JsonElement body, CancellationToken cancellationToken = default);
}

/// <summary>Outcome of <see cref="IIsamsConfigWriter.ConfigureAsync"/>.</summary>
/// <param name="Status"><see cref="ConfigureIsamsStatus.Ok"/> ⇒ 200 with <see cref="Id"/>/<see cref="Endpoint"/>;
/// <see cref="ConfigureIsamsStatus.InvalidBody"/> ⇒ 500 (a Prisma type reject or an encrypt-throw on a non-string
/// apiKey — no row is written).</param>
/// <param name="Id">The upserted row id (echoed as <c>data.id</c>).</param>
/// <param name="Endpoint">The row's endpoint column AFTER the write (may be null) — echoed as <c>data.endpoint</c>.</param>
public sealed record ConfigureIsamsResult(ConfigureIsamsStatus Status, string? Id = null, string? Endpoint = null);

public enum ConfigureIsamsStatus
{
    Ok,
    InvalidBody,
}
