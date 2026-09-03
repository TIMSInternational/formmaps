using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Resolver;
using FormMaps.Infrastructure.CareerFit;
using Microsoft.Extensions.Configuration;

namespace FormMaps.UnitTests.CareerFit;

/// <summary>
/// FM-CF-003 ConfigCache: the provider loads the embedded production rule set through the resolver, once
/// per process (same instance on every read, one loader call under concurrency), reads its version from
/// CareerFit:RulesVersion with the embedded default, and fails closed — a poisoned or unknown version
/// throws CareerFitRulesInvalidException on every access, never a null or an empty family list.
/// </summary>
public class CareerFitRulesProviderTests
{
    private const string Version = "1.0.0-draft.1";

    [Fact]
    public void Embedded_production_rule_set_loads_and_validates()
    {
        var provider = new CareerFitRulesProvider(Version);
        Assert.False(provider.IsLoaded);

        var rules = provider.Rules;

        Assert.True(provider.IsLoaded);
        Assert.Equal(Version, provider.RulesVersion);
        Assert.Equal(Version, rules.RulesVersion);
        Assert.Equal(Enumerable.Range(1, 14), provider.ResolvedFamilies.Select(f => f.OwnerId));
        Assert.Equal(1, provider.ResolvedFamily(1).OwnerId);
        Assert.Throws<KeyNotFoundException>(() => provider.ResolvedFamily(15));
        Assert.Throws<KeyNotFoundException>(() => provider.ResolvedFamily(99));
    }

    [Fact]
    public void Loading_twice_returns_the_same_instance_and_loads_once()
    {
        var loads = 0;
        var provider = new CareerFitRulesProvider(Version, v =>
        {
            Interlocked.Increment(ref loads);
            return CareerFitRulesJson.LoadEmbedded(v);
        });

        var first = provider.Rules;
        var second = provider.Rules;

        Assert.Same(first, second);
        Assert.Same(provider.ResolvedFamilies, provider.ResolvedFamilies);
        Assert.Same(provider.ResolvedFamily(3), provider.ResolvedFamily(3));
        Assert.Same(provider, provider.EnsureLoaded());
        Assert.Equal(1, loads);
    }

    [Fact]
    public void Concurrent_first_readers_share_one_load()
    {
        var loads = 0;
        var provider = new CareerFitRulesProvider(Version, v =>
        {
            Interlocked.Increment(ref loads);
            Thread.Sleep(20); // widen the race window so a non-blocking Lazy mode would double-load
            return CareerFitRulesJson.LoadEmbedded(v);
        });

        var seen = new CareerFitRules[16];
        Parallel.For(0, seen.Length, i => seen[i] = provider.Rules);

        Assert.Equal(1, loads);
        Assert.All(seen, r => Assert.Same(seen[0], r));
    }

    [Fact]
    public void Version_comes_from_configuration_with_the_embedded_default()
    {
        Assert.Equal(CareerFitRulesProvider.DefaultRulesVersion, FromConfig(null).RulesVersion);
        Assert.Equal(CareerFitRulesProvider.DefaultRulesVersion, FromConfig("   ").RulesVersion);
        Assert.Equal("2.0.0", FromConfig(" 2.0.0 ").RulesVersion);
        Assert.Equal(Version, CareerFitRulesProvider.DefaultRulesVersion);
        Assert.Equal("CareerFit:RulesVersion", CareerFitRulesProvider.RulesVersionConfigurationKey);

        // The default is loadable end to end — this is what production boots with.
        Assert.Equal(14, FromConfig(null).EnsureLoaded().ResolvedFamilies.Count);

        Assert.Throws<ArgumentException>(() => new CareerFitRulesProvider(""));
    }

    [Fact]
    public void Unknown_version_fails_on_first_access_and_stays_failed()
    {
        var provider = new CareerFitRulesProvider("9.9.9");

        var first = Assert.Throws<InvalidOperationException>(() => provider.Rules);
        Assert.Contains("9.9.9", first.Message);
        Assert.Contains(Version, first.Message);

        // Lazy caches the failure: nothing later can observe a half-built or null rule set, and the
        // loader is never retried (a missing embedded resource is not transient).
        Assert.False(provider.IsLoaded);
        Assert.Throws<InvalidOperationException>(() => provider.ResolvedFamilies);
        Assert.Throws<InvalidOperationException>(() => provider.EnsureLoaded());
        Assert.False(provider.IsLoaded);
    }

    [Fact]
    public void Poisoned_rule_set_fails_closed_through_the_resolver_on_every_access()
    {
        var loads = 0;
        var provider = new CareerFitRulesProvider(Version, v =>
        {
            Interlocked.Increment(ref loads);
            var clean = CareerFitRulesJson.LoadEmbedded(v);
            return clean with
            {
                Families = clean.Families.Select(f => f.FamilyId == 3 ? f with { PcaRoutes = ["NO_SUCH_ROUTE"] } : f).ToList(),
            };
        });

        var ex = Assert.Throws<CareerFitRulesInvalidException>(() => provider.EnsureLoaded());
        var problem = Assert.Single(ex.Problems);
        Assert.Equal((3, "pca_routes[NO_SUCH_ROUTE]"), (problem.FamilyId, problem.Field));

        Assert.Same(ex, Assert.Throws<CareerFitRulesInvalidException>(() => provider.Rules));
        Assert.Throws<CareerFitRulesInvalidException>(() => provider.ResolvedFamilies);
        Assert.Throws<CareerFitRulesInvalidException>(() => provider.ResolvedFamily(1));
        Assert.Equal(1, loads);
        Assert.False(provider.IsLoaded);
    }

    [Fact]
    public void Document_whose_rules_version_disagrees_with_the_configured_one_is_refused()
    {
        var provider = new CareerFitRulesProvider("1.0.0-draft.2", _ => CareerFitRulesJson.LoadEmbedded(Version));

        var ex = Assert.Throws<CareerFitRulesInvalidException>(() => provider.Rules);

        Assert.Equal("1.0.0-draft.2", ex.RulesVersion);
        var problem = Assert.Single(ex.Problems);
        Assert.Equal("rules_version", problem.Field);
        Assert.Null(problem.FamilyId);
        Assert.Null(problem.ArchetypeId);
        Assert.StartsWith("rule set: rules_version:", problem.ToString());
        Assert.Contains(Version, problem.Message);
    }

    private static CareerFitRulesProvider FromConfig(string? value)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(value is null ? [] : new Dictionary<string, string?> { ["CareerFit:RulesVersion"] = value })
            .Build();
        return CareerFitRulesProvider.FromConfiguration(configuration);
    }
}
