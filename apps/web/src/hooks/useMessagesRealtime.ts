import { useEffect, useRef } from "react";
import * as signalR from "@microsoft/signalr";

const REALTIME_ENABLED = process.env.NEXT_PUBLIC_FORMMAPS_ROUTE_MESSAGES_REALTIME_TO_DOTNET === "1";
const DOTNET_HUB_BASE_URL = process.env.NEXT_PUBLIC_FORMMAPS_DOTNET_HUB_BASE_URL || "";

interface MessageReceivedPayload {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdDate: string;
}

/**
 * No-op (does nothing, returns nothing) unless FORMMAPS_ROUTE_MESSAGES_REALTIME_TO_DOTNET is on —
 * callers must keep their existing 15s poll as the fallback delivery path regardless of this
 * hook's state; this hook only ever supplements it, never replaces it.
 *
 * `accessTokenFactory` fetches a fresh realtime ticket on every connect/reconnect (the ticket is
 * short-lived by design, currently 30s server-side — see Task 9's adversarial review fix) — it is
 * never cached or reused across connection attempts.
 */
export function useMessagesRealtime(onMessageReceived: (payload: MessageReceivedPayload) => void) {
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  useEffect(() => {
    if (!REALTIME_ENABLED || !DOTNET_HUB_BASE_URL) return;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${DOTNET_HUB_BASE_URL}/hubs/messages`, {
        accessTokenFactory: async () => {
          const res = await fetch("/api/v1/messages/realtime-ticket", { method: "POST", credentials: "include" });
          if (!res.ok) return "";
          const body = await res.json();
          return body?.data?.ticket ?? "";
        },
      })
      .withAutomaticReconnect()
      .build();

    connection.on("messageReceived", onMessageReceived);
    connection.start().catch(() => { /* falls back to the existing poll — no user-facing error */ });
    connectionRef.current = connection;

    return () => { connection.stop(); };
  }, [onMessageReceived]);
}
