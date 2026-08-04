"use client";

import { useState } from "react";
import {
  Clock,
  FileText,
  MessageSquare,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "./shared-ui";
import type { NoteType, CounselorNote, CounselorNotePayload } from "@/types/counselorNotes";
import type { UseMutationResult } from "@tanstack/react-query";

interface NotesTabProps {
  studentId: string;
  notes: CounselorNote[];
  createNote: UseMutationResult<CounselorNote, Error, CounselorNotePayload>;
  deleteNote: UseMutationResult<void, Error, { noteId: string; studentId: string }>;
}

export function NotesTab({ studentId, notes, createNote, deleteNote }: NotesTabProps) {
  const { t } = useTranslation();
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("general");

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createNote.mutate(
      { studentId, type: noteType, content: newNote, isPrivate: false },
      {
        onSuccess: () => setNewNote(""),
        onError: (err: Error) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Add Note Form */}
      <Card className="h-fit">
        <CardHeader icon={Plus} color="#10b981" title="New Entry" />
        <div style={{ padding: 16 }} className="space-y-3">
          <div className="space-y-1">
            <label style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</label>
            <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
              <SelectTrigger className="h-9 text-xs" style={{ borderRadius: 6 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Observation</SelectItem>
                <SelectItem value="meeting">Meeting Summary</SelectItem>
                <SelectItem value="follow_up">Action items / Follow-up</SelectItem>
                <SelectItem value="academic">Academic Intervention</SelectItem>
                <SelectItem value="career">Career Guidance</SelectItem>
                <SelectItem value="personal">Personal / Social</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</label>
            <Textarea
              placeholder={t("schoolAdmin.students.notePlaceholder", "Document interaction details here...")}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={5}
              className="text-xs resize-none"
              style={{ borderRadius: 6 }}
            />
          </div>

          <button
            onClick={handleAddNote}
            disabled={!newNote.trim() || createNote.isPending}
            style={{
              width: "100%", height: 36, borderRadius: 6,
              fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: "var(--admin-accent-blue, #2E9098)", color: "#fff",
              border: "none", cursor: "pointer",
              opacity: (!newNote.trim() || createNote.isPending) ? 0.6 : 1,
            }}
          >
            <Send style={{ width: 12, height: 12 }} />
            Publish to File
          </button>
        </div>
      </Card>

      {/* Notes List */}
      <div className="lg:col-span-2">
        <Card>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "var(--admin-bg-hover)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FileText style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Counselor Notes</span>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
                border: "1px solid var(--admin-border-default)",
              }}>
                {notes.length} entries
              </span>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            {notes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 16px" }}>
                <MessageSquare style={{ width: 24, height: 24, color: "var(--admin-font-tertiary)", margin: "0 auto 8px", opacity: 0.4 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>No notes found</div>
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
                  There are currently no notes on file for this student.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((note: CounselorNote) => (
                  <div key={note.id} className="group" style={{
                    padding: "12px 14px", borderRadius: 6,
                    border: "1px solid var(--admin-border-default)",
                    background: "var(--admin-bg-card)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                          background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
                          textTransform: "uppercase", letterSpacing: "0.03em",
                        }}>
                          {note.type.replace('_', ' ')}
                        </span>
                        {note.isPrivate && (
                          <span style={{
                            fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                            background: "rgba(245,158,11,0.1)", color: "#f59e0b",
                            textTransform: "uppercase", letterSpacing: "0.03em",
                          }}>
                            Confidential
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>
                          {note.createdDate && format(new Date(note.createdDate), "MMM d, yyyy")}
                        </span>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteNote.mutate({ noteId: note.id, studentId })}
                          title="Delete entry"
                          style={{ width: 22, height: 22, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}
                        >
                          <Trash2 style={{ width: 12, height: 12, color: "#ef4444" }} />
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: "var(--admin-font-primary)", whiteSpace: "pre-wrap", lineHeight: 1.5, padding: "8px 10px", borderRadius: 4, background: "var(--admin-bg-hover)" }}>
                      {note.content}
                    </div>

                    {note.followUpDate && (
                      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 4, background: "rgba(245,158,11,0.08)", width: "fit-content" }}>
                        <Clock style={{ width: 11, height: 11, color: "#f59e0b" }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                          Follow-up: {format(new Date(note.followUpDate), "MMM d, yyyy")}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
