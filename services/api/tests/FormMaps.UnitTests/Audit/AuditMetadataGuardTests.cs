using FormMaps.Application.Audit;

namespace FormMaps.UnitTests.Audit;

public class AuditMetadataGuardTests
{
    [Fact]
    public void Validate_NullMetadata_DoesNotThrow() => AuditMetadataGuard.Validate(null);

    [Fact]
    public void Validate_EmptyMetadata_DoesNotThrow() =>
        AuditMetadataGuard.Validate(new Dictionary<string, object?>());

    [Theory]
    [InlineData("email")]
    [InlineData("actorEmail")]
    [InlineData("userName")]
    [InlineData("ipAddress")]
    [InlineData("phoneNumber")]
    [InlineData("dob")]
    public void Validate_DisallowedKey_Throws(string key)
    {
        var metadata = new Dictionary<string, object?> { [key] = "whatever" };
        Assert.Throws<ArgumentException>(() => AuditMetadataGuard.Validate(metadata));
    }

    /// <summary>
    /// The guard normalizes before matching. Without that normalization every one of these
    /// would sail through -- a denylist that only catches the lowercase spelling is theatre.
    /// </summary>
    [Theory]
    [InlineData("EMAIL")]
    [InlineData("ActorEMail")]
    [InlineData("IPAddress")]
    [InlineData("StudentName")]
    [InlineData("SSN")]
    [InlineData("homeAddress")]
    [InlineData("birthDate")]
    [InlineData("ip_address")]
    public void Validate_DisallowedKey_IsCaseInsensitive(string key)
    {
        var metadata = new Dictionary<string, object?> { [key] = "whatever" };
        Assert.Throws<ArgumentException>(() => AuditMetadataGuard.Validate(metadata));
    }

    /// <summary>
    /// A guard that throws a generic message is unactionable at 3am. The offending key has to be
    /// named -- and it has to be the offending one, not merely the first key in the dictionary.
    /// </summary>
    [Fact]
    public void Validate_DisallowedKey_ExceptionNamesTheOffendingKey()
    {
        var metadata = new Dictionary<string, object?>
        {
            ["score"] = 87,
            ["examId"] = "exam_1",
            ["actorEmail"] = "someone@example.com",
        };

        var ex = Assert.Throws<ArgumentException>(() => AuditMetadataGuard.Validate(metadata));
        Assert.Contains("actorEmail", ex.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("someone@example.com", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Validate_AllowedKeys_DoesNotThrow()
    {
        var metadata = new Dictionary<string, object?>
        {
            ["score"] = 87, ["band"] = "high", ["examId"] = "exam_1", ["correctCount"] = 12,
        };
        AuditMetadataGuard.Validate(metadata);
    }

    /// <summary>
    /// Negative control for the denylist's blast radius: these are the ID/enum/count shapes every
    /// v1 call site actually logs. A guard that rejects them is a guard nobody can use.
    /// </summary>
    [Theory]
    [InlineData("sessionId")]
    [InlineData("schoolId")]
    [InlineData("attemptCount")]
    [InlineData("durationMs")]
    [InlineData("outcome")]
    [InlineData("subjectType")]
    public void Validate_IdEnumAndCountKeys_DoNotThrow(string key)
    {
        AuditMetadataGuard.Validate(new Dictionary<string, object?> { [key] = "value" });
    }
}
