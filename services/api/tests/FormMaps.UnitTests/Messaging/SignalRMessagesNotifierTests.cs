using FormMaps.Api.Realtime;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace FormMaps.UnitTests.Messaging;

public sealed class SignalRMessagesNotifierTests
{
    [Fact]
    public async Task Pushes_to_the_recipients_group_with_the_messageReceived_method()
    {
        var mockClients = new Mock<IHubClients>();
        var mockGroupProxy = new Mock<IClientProxy>();
        mockClients.Setup(c => c.Group("user:recipient-1")).Returns(mockGroupProxy.Object);
        var mockHubContext = new Mock<IHubContext<MessagesHub>>();
        mockHubContext.Setup(h => h.Clients).Returns(mockClients.Object);

        var notifier = new SignalRMessagesNotifier(mockHubContext.Object, NullLogger<SignalRMessagesNotifier>.Instance);
        await notifier.NotifyMessageReceivedAsync("recipient-1", new { text = "hi" });

        mockGroupProxy.Verify(
            p => p.SendCoreAsync("messageReceived", It.Is<object[]>(args => args.Length == 1), default),
            Times.Once);
    }

    [Fact]
    public async Task Swallows_hub_exceptions_and_never_throws()
    {
        var mockHubContext = new Mock<IHubContext<MessagesHub>>();
        mockHubContext.Setup(h => h.Clients).Throws(new InvalidOperationException("hub is down"));

        var notifier = new SignalRMessagesNotifier(mockHubContext.Object, NullLogger<SignalRMessagesNotifier>.Instance);

        await notifier.NotifyMessageReceivedAsync("recipient-1", new { text = "hi" }); // must not throw
    }
}
