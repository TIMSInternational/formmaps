using FormMaps.Infrastructure;
using FormMaps.Workers;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddHostedService<Worker>();

// Domain 9a: reconciliation worker needs the DB session factory + billing services registered by
// FormMaps.Infrastructure (same extension method FormMaps.Api's DependencyInjection.cs uses).
builder.Services.AddFormMapsInfrastructure(builder.Configuration);
builder.Services.AddHostedService<BillingReconciliationWorker>();

var host = builder.Build();
host.Run();
