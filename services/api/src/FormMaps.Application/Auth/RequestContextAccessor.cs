namespace FormMaps.Application.Auth;

public sealed class RequestContextAccessor : IRequestContextAccessor
{
    public RequestContext Current { get; set; } = RequestContext.Anonymous();
}
