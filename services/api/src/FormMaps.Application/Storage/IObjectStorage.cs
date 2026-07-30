namespace FormMaps.Application.Storage;

/// <summary>
/// Object storage (S3) — the .NET service's first file-storage surface. Port of the live TS <c>lib/s3.ts</c>
/// <c>uploadAndGetUrl</c>: store a file under a generated key and return a PRESIGNED read URL (24h). Uploads set
/// <c>Content-Disposition: attachment</c> (never inline) so a stored asset can't be rendered in the browser; reads
/// are presigned rather than public (matches the Node app — the bucket is private).
/// </summary>
public interface IObjectStorage
{
    /// <summary>
    /// Upload <paramref name="body"/> under <paramref name="folder"/> (an S3 key prefix, e.g. "schools/logos") and
    /// return the generated key + a 24h presigned GET URL. The key is <c>{folder}/{unixMs}-{6 base36 chars}{ext}</c>
    /// where ext is derived from <paramref name="filename"/> — the same shape as <c>lib/s3.ts</c> (the exact value is
    /// random and need not match Node's).
    /// </summary>
    Task<StoredObject> UploadAndGetUrlAsync(
        string folder, string filename, byte[] body, string contentType, CancellationToken cancellationToken = default);

    /// <summary>
    /// Presign a GET for a key that was stored at some earlier time (as opposed to <see cref="UploadAndGetUrlAsync"/>,
    /// which uploads first). <paramref name="ttlSeconds"/> and <paramref name="inline"/> are caller-controlled —
    /// unlike the fixed 24h/attachment shape of an upload-time presign, a read of an existing object may need a much
    /// shorter TTL and an inline (browser-renderable) disposition, e.g. resume.ts's GET /:id/original (300s, inline,
    /// application/pdf).
    /// </summary>
    Task<string> GetPresignedReadUrlAsync(
        string key, int ttlSeconds, bool inline, string contentType, CancellationToken cancellationToken = default);
}

/// <summary>The result of an upload: the stored key + its presigned read URL.</summary>
public sealed record StoredObject(string Key, string Url);

/// <summary>Bucket + region for object storage, bound once from env/IConfiguration in DI.</summary>
/// <param name="Bucket">S3_BUCKET (default "formmaps-platform-uploads").</param>
/// <param name="Region">AWS_REGION (default "us-east-1").</param>
public sealed record ObjectStorageOptions(string Bucket, string Region);
