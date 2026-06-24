import { askAi } from "@/services/aiChatService";

/**
 * Rewrites `text` to ≤150 characters using the platform AI service.
 * Subscription gating and PII sanitization are handled server-side on
 * /api/v1/aichat/ask — no client-side guardrails needed here.
 */
export async function polishDescription(text: string): Promise<string> {
  const prompt = `Rewrite the following activity description in at most 150 characters, preserving the key achievements. Return ONLY the rewritten line:\n\n${text}`;
  const reply = (await askAi(prompt, [])).trim();
  return (reply.length > 0 ? reply : text.trim()).slice(0, 150);
}
