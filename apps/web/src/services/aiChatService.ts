import { apiRequest } from "@/lib/api/apiClient";

export interface AiChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Ask FormMaps AI via the platform API (Bedrock-backed, subscription-gated,
 * input-sanitized). The old standalone AI service (localhost:8000) is legacy —
 * it targets the pre-rewrite backend and is not deployed for this stack.
 */
export async function askAi(
  message: string,
  conversationHistory: AiChatTurn[],
  signal?: AbortSignal
): Promise<string> {
  const res = await apiRequest("/api/v1/aichat/ask", {
    method: "POST",
    data: { message, conversationHistory },
    signal,
    retries: 0,
    showErrorToast: false,
  });
  return res?.data?.message ?? "";
}
