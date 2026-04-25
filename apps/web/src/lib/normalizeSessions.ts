export type RawSession = any;

export type NormalizedSession = {
  id: string;
  status: string;
  startTime: Date | null;
  endTime: Date | null;
  [key: string]: any;
};

function extractArrayShape(input: any): any[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.data)) return input.data;
  if (input.data && Array.isArray(input.data.data)) return input.data.data;
  return [];
}

export function normalizeSessions(input: any): NormalizedSession[] {
  const arr = extractArrayShape(input);

  return arr.map((s: RawSession) => {
    const startRaw = s.startTime ?? s.start ?? s.start_date ?? s.startDate ?? null;
    const endRaw = s.endTime ?? s.end ?? s.end_date ?? s.endDate ?? null;

    let start: Date | null = null;
    let end: Date | null = null;

    try {
      if (startRaw) start = new Date(startRaw);
      if (endRaw) end = new Date(endRaw);
    } catch (e) {
      start = null;
      end = null;
    }

    const status = (s.status || s.state || "").toString().toLowerCase();

    return {
      ...s,
      id: s.id ?? s._id ?? `${Math.random().toString(36).slice(2, 9)}`,
      status,
      startTime: start,
      endTime: end,
    } as NormalizedSession;
  });
}

export function isUpcoming(session: NormalizedSession, now = Date.now()) {
  const start = session.startTime ? session.startTime.getTime() : 0;
  const statusOk = session.status === "confirmed" || session.status === "rescheduled";
  return statusOk && start > now;
}

export function isPast(session: NormalizedSession, now = Date.now()) {
  if (session.status === "completed" || session.status === "cancelled") return true;
  const start = session.startTime ? session.startTime.getTime() : Infinity;
  return (session.status === "confirmed" || session.status === "rescheduled") && start <= now;
}

export default normalizeSessions;
