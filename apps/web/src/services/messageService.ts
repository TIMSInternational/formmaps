import { apiRequest } from "@/lib/api/apiClient";

export interface ConversationSummary {
  id: string;
  otherParticipant: { id: string; name: string; email: string };
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

export interface MessageData {
  id: string;
  senderId: string;
  content: string;
  messageType: string;
  readAt: string | null;
  createdDate: string;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await apiRequest("/api/v1/messages/conversations", { method: "GET" });
  return res?.data ?? res ?? [];
}

export async function createConversation(recipientId: string): Promise<ConversationSummary> {
  const res = await apiRequest("/api/v1/messages/conversations", { method: "POST", data: { recipientId } });
  return res?.data ?? res;
}

export async function searchContacts(search?: string): Promise<{ id: string; name: string; email: string; roleName: string }[]> {
  const res = await apiRequest(`/api/v1/messages/contacts${search ? `?search=${encodeURIComponent(search)}` : ""}`, { method: "GET" });
  return res?.data ?? res ?? [];
}

export async function getConversationMessages(id: string, page = 1, limit = 50): Promise<{ messages: MessageData[]; total: number }> {
  const res = await apiRequest(`/api/v1/messages/conversations/${id}?page=${page}&limit=${limit}`, { method: "GET" });
  return res?.data ?? res;
}

export async function sendMessage(conversationId: string, content: string): Promise<MessageData> {
  const res = await apiRequest(`/api/v1/messages/conversations/${conversationId}`, { method: "POST", data: { content } });
  return res?.data ?? res;
}

export async function getUnreadCount(): Promise<number> {
  const res = await apiRequest("/api/v1/messages/unread-count", { method: "GET" });
  return res?.data?.count ?? res?.count ?? 0;
}
