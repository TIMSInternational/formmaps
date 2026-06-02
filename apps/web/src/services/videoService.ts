import { apiRequest } from "@/lib/api/apiClient";

export interface VideoSession {
  id: string;
  sessionName: string;
  status: string;
  caller: { id: string; name: string; email?: string };
  participant: { id: string; name: string; email?: string };
  startTime: string;
  endTime?: string;
}

export async function isVideoEnabled(): Promise<boolean> {
  try {
    const res = await apiRequest("/api/v1/video/enabled", { method: "GET" });
    return res?.data?.enabled ?? false;
  } catch { return false; }
}

export async function listVideoSessions(): Promise<VideoSession[]> {
  const res = await apiRequest("/api/v1/video/sessions", { method: "GET" });
  return res?.data ?? [];
}

export interface VideoSignatureResponse {
  signature: string;
  roomUrl: string;
  roomName: string;
}

export async function getVideoSignature(sessionName: string, role: number): Promise<VideoSignatureResponse> {
  const res = await apiRequest("/api/v1/video/signature", {
    method: "POST",
    data: { sessionName, role },
  });
  return {
    signature: res?.data?.signature ?? res?.signature ?? "",
    roomUrl: res?.data?.roomUrl ?? "",
    roomName: res?.data?.roomName ?? sessionName,
  };
}

export async function createVideoSession(participantId: string): Promise<VideoSession> {
  const res = await apiRequest("/api/v1/video/sessions", {
    method: "POST",
    data: { participantId },
  });
  return res?.data ?? res;
}

export async function getVideoSession(sessionId: string): Promise<VideoSession> {
  const res = await apiRequest(`/api/v1/video/sessions/${sessionId}`, { method: "GET" });
  return res?.data ?? res;
}

export async function endVideoSession(sessionId: string): Promise<void> {
  await apiRequest(`/api/v1/video/sessions/${sessionId}/end`, { method: "POST" });
}

export async function scheduleVideoSession(
  participantId: string,
  scheduledAt: string,
  duration: number = 60,
  notes: string = ""
): Promise<VideoSession> {
  const res = await apiRequest("/api/v1/video/sessions/schedule", {
    method: "POST",
    data: { participantId, scheduledAt, duration, notes },
  });
  return res?.data ?? res;
}

export async function startScheduledSession(sessionId: string): Promise<VideoSession> {
  const res = await apiRequest(`/api/v1/video/sessions/${sessionId}/start`, { method: "POST" });
  return res?.data ?? res;
}

export async function cancelVideoSession(sessionId: string): Promise<void> {
  await apiRequest(`/api/v1/video/sessions/${sessionId}/cancel`, { method: "POST" });
}
