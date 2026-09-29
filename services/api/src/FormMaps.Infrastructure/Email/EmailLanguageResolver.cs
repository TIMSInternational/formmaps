using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Email;
using Microsoft.Extensions.DependencyInjection;

namespace FormMaps.Infrastructure.Email;

/// <summary>
/// <see cref="IEmailLanguageResolver"/> over <c>user_settings.language</c>. Reads under
/// <see cref="RequestContext.System"/>: the language of the person an email is ADDRESSED to (or of the student a
/// 360° invite is about) is rarely the caller's own row, and a display preference is not tenant data worth an RLS
/// round trip. The session factory is resolved lazily and every failure — no database configured, connection
/// refused, missing table — degrades to <see cref="EmailLanguage.Default"/>, so a language lookup can never fail
/// or delay-by-exception the email it decorates.
/// </summary>
public sealed class EmailLanguageResolver(IServiceProvider services) : IEmailLanguageResolver
{
    public async Task<string> ForUserAsync(string? userId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(userId))
        {
            return EmailLanguage.Default;
        }

        var map = await ForUsersAsync([userId], cancellationToken);
        return map[userId];
    }

    public async Task<IReadOnlyDictionary<string, string>> ForUsersAsync(
        IReadOnlyCollection<string> userIds, CancellationToken cancellationToken = default)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var id in userIds.Where(id => !string.IsNullOrEmpty(id)))
        {
            result[id] = EmailLanguage.Default;
        }

        if (result.Count == 0)
        {
            return result;
        }

        try
        {
            var factory = services.GetRequiredService<IFormMapsDatabaseSessionFactory>();
            await using var session = await factory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
            await using var command = session.Connection.CreateCommand();
            command.Transaction = session.Transaction;
            command.CommandText = """SELECT "userId", "language" FROM "user_settings" WHERE "userId" = ANY(@ids)""";
            var parameter = command.CreateParameter();
            parameter.ParameterName = "ids";
            parameter.Value = result.Keys.ToArray();
            command.Parameters.Add(parameter);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var language = EmailLanguage.Normalize(reader.IsDBNull(1) ? null : reader.GetString(1));
                if (language is not null)
                {
                    result[reader.GetString(0)] = language;
                }
            }
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            // Rule 4: keep the defaults.
        }

        return result;
    }
}
