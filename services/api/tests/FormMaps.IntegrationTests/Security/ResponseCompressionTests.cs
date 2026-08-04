using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Security;

/// <summary>
/// formmaps#86 — response compression. This API served every JSON response
/// uncompressed; it hid because nothing in the config LOOKS wrong until you check
/// for a response header.
///
/// So these assert observable transport behaviour, never that AddResponseCompression
/// appears in Program.cs.
///
/// These only mean something because WebApplicationFactory talks to an in-memory
/// TestServer, where nothing performs automatic content decoding — so the raw
/// Content-Encoding survives to be asserted on. Over a real socket, HttpClient's
/// default handler decompresses transparently and every assertion here would pass
/// against a server doing nothing at all. If this is ever ported to a live-socket
/// harness, set AutomaticDecompression = None or the whole file goes vacuous.
/// </summary>
public class ResponseCompressionTests
{
    [Fact]
    public async Task Json_response_is_compressed_when_the_client_offers_an_encoding()
    {
        using var factory = new CompressionApiFactory();
        using var client = factory.CreateRawClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("Accept-Encoding", "gzip");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("gzip", Assert.Single(response.Content.Headers.ContentEncoding));
    }

    [Fact]
    public async Task Brotli_is_preferred_over_gzip_when_both_are_offered()
    {
        using var factory = new CompressionApiFactory();
        using var client = factory.CreateRawClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("Accept-Encoding", "br, gzip");

        var response = await client.SendAsync(request);

        // Brotli is registered first on purpose. If this reports gzip, the provider
        // order changed and the better encoding is being left unused.
        Assert.Equal("br", Assert.Single(response.Content.Headers.ContentEncoding));
    }

    [Fact]
    public async Task Response_is_not_compressed_when_the_client_does_not_ask()
    {
        using var factory = new CompressionApiFactory();
        using var client = factory.CreateRawClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("Accept-Encoding", "identity");

        var response = await client.SendAsync(request);

        Assert.Empty(response.Content.Headers.ContentEncoding);
    }

    [Fact]
    public async Task Vary_accept_encoding_is_set_so_caches_cannot_serve_the_wrong_body()
    {
        // Without Vary, a shared cache can hand a gzipped body to a client that never
        // asked for one. The middleware sets it; a hand-rolled fix usually forgets.
        using var factory = new CompressionApiFactory();
        using var client = factory.CreateRawClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("Accept-Encoding", "gzip");

        var response = await client.SendAsync(request);

        Assert.Contains(response.Headers.Vary, v => v.Equals("Accept-Encoding", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Compressed_body_actually_decodes_to_the_same_json()
    {
        // Guards the boring catastrophe: a Content-Encoding header on a body that is
        // not really in that encoding, or is double-encoded. Decompressed by hand
        // because nothing in this pipeline does it for us.
        using var factory = new CompressionApiFactory();
        using var client = factory.CreateRawClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("Accept-Encoding", "br");

        var response = await client.SendAsync(request);
        Assert.Equal("br", Assert.Single(response.Content.Headers.ContentEncoding));

        await using var raw = await response.Content.ReadAsStreamAsync();
        await using var decoded = new System.IO.Compression.BrotliStream(raw, System.IO.Compression.CompressionMode.Decompress);
        using var reader = new StreamReader(decoded);
        var body = await reader.ReadToEndAsync();

        Assert.Contains("\"status\"", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Compression_measurably_reduces_a_real_payload()
    {
        // /api/v1/migration/roadmap is the endpoint the 63% figure was measured on in
        // production (1743 bytes, no auth, no database), so it is the honest thing to
        // assert against. /health is 40 bytes and is a bad test subject — see the
        // small-payload test below for why.
        using var factory = new CompressionApiFactory();
        using var client = factory.CreateRawClient();

        var plain = await ByteCount(client, "/api/v1/migration/roadmap", "identity");
        var compressed = await ByteCount(client, "/api/v1/migration/roadmap", "br");

        Assert.True(plain > 500, $"expected a payload worth compressing, got {plain} bytes");
        Assert.True(compressed < plain / 2, $"brotli produced {compressed} bytes vs {plain} uncompressed");
    }

    [Fact]
    public async Task A_tiny_response_gets_slightly_BIGGER_and_that_is_accepted()
    {
        // Documents a real difference from the Node side rather than hiding it.
        // ASP.NET Core's ResponseCompression has NO size threshold — unlike Node's
        // `compression`, which skips bodies under 1KB — so a 40-byte /health body
        // comes back as ~44 bytes of brotli, and loses Content-Length to chunking.
        //
        // Accepted deliberately: a handful of bytes on tiny responses is worth 60%+ on
        // the list payloads that actually move, and the framework ships no threshold
        // to configure. If this ever matters, the fix is custom middleware, not an
        // options flag. Asserted so the asymmetry is a known, reviewed property.
        using var factory = new CompressionApiFactory();
        using var client = factory.CreateRawClient();

        var plain = await ByteCount(client, "/health", "identity");
        var compressed = await ByteCount(client, "/health", "br");

        Assert.True(plain < 200, "this test only means anything for a small body");
        Assert.True(compressed >= plain, $"expected no saving on a tiny body; got {compressed} vs {plain}");
    }

    private static async Task<int> ByteCount(HttpClient client, string path, string acceptEncoding)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add("Accept-Encoding", acceptEncoding);
        var response = await client.SendAsync(request);
        return (await response.Content.ReadAsByteArrayAsync()).Length;
    }

    [Fact]
    public void Streaming_content_types_are_excluded_so_the_signalr_transport_is_untouched()
    {
        // The hazard is SignalR's LONG-POLLING transport, which is text/plain (and
        // text/event-stream for SSE). Compressing a streaming transport gives you a
        // hub that appears to connect and then delivers nothing — the #63/Domain-7b
        // class of bug, and miserable to diagnose.
        //
        // ResponseCompressionDefaults.MimeTypes INCLUDES text/plain, which is why this
        // config sets MimeTypes explicitly instead. Asserted against the resolved
        // options rather than an endpoint because there is no unauthenticated
        // text/plain route to probe, and a wrong exclusion list has no other visible
        // symptom until the hub breaks in production.
        //
        // Note: /negotiate itself IS application/json and IS compressed. That is fine
        // and intended — negotiate is one ordinary request/response, not a stream.
        using var factory = new CompressionApiFactory();
        var options = factory.Services
            .GetRequiredService<Microsoft.Extensions.Options.IOptions<Microsoft.AspNetCore.ResponseCompression.ResponseCompressionOptions>>()
            .Value;

        Assert.DoesNotContain("text/plain", options.MimeTypes);
        Assert.DoesNotContain("text/event-stream", options.MimeTypes);
        Assert.Contains("application/json", options.MimeTypes);
    }

    private sealed class CompressionApiFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
            => builder.UseEnvironment(Environments.Development);

        /// <summary>
        /// WebApplicationFactory talks to an in-memory TestServer, so there is no
        /// socket handler and nothing performs automatic content decoding — the raw
        /// Content-Encoding is observable on the plain client. That is what makes
        /// these assertions meaningful; a real HttpClient over a socket would strip
        /// the header and every one of them would pass against a server doing nothing.
        /// </summary>
        public HttpClient CreateRawClient() => CreateClient();
    }
}
