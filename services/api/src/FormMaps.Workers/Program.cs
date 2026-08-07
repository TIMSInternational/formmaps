using FormMaps.Infrastructure;
// formmaps#99: BillingReconciliationWorker moved to FormMaps.Infrastructure.Billing so FormMaps.Api can
// host it (the Dockerfile publishes only FormMaps.Api, so this standalone host has never been deployed).
// This host keeps hosting it too — FormMaps.Workers.csproj already references FormMaps.Infrastructure.
using FormMaps.Infrastructure.Billing;
using FormMaps.Workers;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddHostedService<Worker>();

// Domain 9a: reconciliation worker needs the DB session factory + billing services registered by
// FormMaps.Infrastructure (same extension method FormMaps.Api's DependencyInjection.cs uses).
builder.Services.AddFormMapsInfrastructure(builder.Configuration);
builder.Services.AddHostedService<BillingReconciliationWorker>();

var host = builder.Build();
host.Run();
