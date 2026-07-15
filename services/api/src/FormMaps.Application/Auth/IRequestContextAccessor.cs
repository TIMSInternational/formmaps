namespace FormMaps.Application.Auth;

public interface IRequestContextAccessor
{
    RequestContext Current { get; set; }
}
