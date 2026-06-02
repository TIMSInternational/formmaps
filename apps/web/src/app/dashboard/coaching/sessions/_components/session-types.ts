export interface FormattedSession {
  id: string;
  date: string;
  time: string;
  duration: string;
  studentName: string;
  studentAvatar?: string;
  studentId?: string;
  topic: string;
  status: string;
  startTimestamp?: number;
  bucket: string;
  notes: string;
  startTime?: string;
  endTime?: string;
  slot?: { start: string; end: string };
  meetingLink?: string;
  studentImage?: string;
  [key: string]: unknown;
}
