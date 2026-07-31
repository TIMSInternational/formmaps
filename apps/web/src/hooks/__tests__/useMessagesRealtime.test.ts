import { renderHook } from "@testing-library/react";
import { useMessagesRealtime } from "../useMessagesRealtime";

describe("useMessagesRealtime", () => {
  it("is a no-op when the realtime flag is off (default/dark state)", () => {
    const onMessageReceived = jest.fn();

    const { unmount } = renderHook(() => useMessagesRealtime(onMessageReceived));

    expect(onMessageReceived).not.toHaveBeenCalled();
    expect(() => unmount()).not.toThrow(); // no connection was started, cleanup must still be safe
  });
});
