namespace FormMaps.Application.Auth;

public sealed record GuardDecision(
    bool Allowed,
    int StatusCode,
    string Code,
    string Message)
{
    public static GuardDecision Allow()
    {
        return new GuardDecision(true, 200, "allowed", "Allowed");
    }

    public static GuardDecision Deny(int statusCode, string code, string message)
    {
        return new GuardDecision(false, statusCode, code, message);
    }
}
