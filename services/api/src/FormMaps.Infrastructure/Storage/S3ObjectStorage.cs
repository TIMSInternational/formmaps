using System.Security.Cryptography;
using Amazon.S3;
using Amazon.S3.Model;
using FormMaps.Application.Storage;

namespace FormMaps.Infrastructure.Storage;

/// <summary>
/// S3-backed <see cref="IObjectStorage"/> — port of <c>lib/s3.ts</c> (uploadFile + getFileUrl, composed as
/// uploadAndGetUrl). PutObject with <c>Content-Disposition: attachment</c>, then a 24h presigned GET URL. The
/// <see cref="IAmazonS3"/> client is supplied via a DI factory lambda (like the SES client) so its credential
/// resolution happens on first use — never at startup — keeping a boot in a credential-less env from bricking the
/// whole service (uploads are dark until the flag flips).
/// </summary>
public sealed class S3ObjectStorage(IAmazonS3 client, ObjectStorageOptions options) : IObjectStorage
{
    private const int PresignSeconds = 24 * 3600; // lib/s3.ts: 24-hour URL.
    private const string Base36 = "0123456789abcdefghijklmnopqrstuvwxyz";

    public async Task<StoredObject> UploadAndGetUrlAsync(
        string folder, string filename, byte[] body, string contentType, CancellationToken cancellationToken = default)
    {
        var key = BuildKey(folder, filename);

        using (var stream = new MemoryStream(body, writable: false))
        {
            var put = new PutObjectRequest
            {
                BucketName = options.Bucket,
                Key = key,
                InputStream = stream,
                ContentType = contentType,
            };
            put.Headers.ContentDisposition = "attachment";
            await client.PutObjectAsync(put, cancellationToken);
        }

        // Presigning is a local (offline) signing operation — no network call.
        var url = client.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = options.Bucket,
            Key = key,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddSeconds(PresignSeconds),
        });

        return new StoredObject(key, url);
    }

    // {folder}/{unixMs}-{6 base36 chars}{ext} — lib/s3.ts key shape (Date.now() + Math.random().toString(36)).
    private static string BuildKey(string folder, string filename)
    {
        var ext = filename.Contains('.') ? filename[filename.LastIndexOf('.')..] : "";
        var ms = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return $"{folder}/{ms}-{RandomBase36(6)}{ext}";
    }

    private static string RandomBase36(int length)
    {
        Span<byte> bytes = stackalloc byte[length];
        RandomNumberGenerator.Fill(bytes);
        var chars = new char[length];
        for (var i = 0; i < length; i++)
        {
            chars[i] = Base36[bytes[i] % Base36.Length];
        }

        return new string(chars);
    }
}
