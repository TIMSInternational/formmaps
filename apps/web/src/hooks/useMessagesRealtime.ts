import { useEffect, useRef } from "react";
import * as signalR from "@microsoft/signalr";

/**
 * Mirrors `isEnabled()` in next.config.ts (accepts "1" or "true", case-insensitively) rather than a
 * strict `=== "1"`, and trims first. Deliberate: `echo "1" | vercel env add` stores a TRAILING NEWLINE,
 * which a strict equality check swallows silently — the flag reads as permanently off with no error
 * anywhere. This codebase has already been bitten by exactly that once.
 */
function isFlagEnabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

const REALTIME_ENABLED = isFlagEnabled(process.env.NEXT_PUBLIC_FORMMAPS_ROUTE_MESSAGES_REALTIME_TO_DOTNET);

/**
 * SECOND kill switch, and a silent one: with the realtime flag ON but this unset, the hook still
 * no-ops. Both must be set for realtime to do anything. Note both are NEXT_PUBLIC_*, i.e. inlined at
 * BUILD time — flipping either requires a redeploy, not just an env change.
 */
const DOTNET_HUB_BASE_URL = process.env.NEXT_PUBLIC_FORMMAPS_DOTNET_HUB_BASE_URL?.trim() || "";

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
 *
 * The handler is held in a ref and the connection effect has EMPTY deps, so the connection's lifetime
 * matches the page's rather than the caller's callback identity. Callers naturally memoize a handler
 * that closes over the selected conversation, so depending on it directly meant every conversation
 * switch tore down the socket and rebuilt it (stop → new HubConnection → new ticket fetch → full
 * negotiate), dropping any push that arrived in that window and racing the unawaited stop().
 */
export function useMessagesRealtime(onMessageReceived: (payload: MessageReceivedPayload) => void) {
  const handlerRef = useRef(onMessageReceived);
  handlerRef.current = onMessageReceived;

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

    connection.on("messageReceived", (payload: MessageReceivedPayload) => handlerRef.current(payload));
    connection.start().catch(() => { /* falls back to the existing poll — no user-facing error */ });

    return () => {
      // Unawaited by necessity (cleanup is sync) but explicitly caught: stopping a connection that is
      // still mid-negotiate rejects, which would otherwise surface as an unhandled rejection on unmount.
      connection.stop().catch(() => { /* tearing down anyway */ });
    };
  }, []);
}
