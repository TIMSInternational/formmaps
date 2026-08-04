"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, Send, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TabsContent } from "@/components/ui/tabs";
import type { NoteType, CounselorNote } from "@/types/counselorNotes";
import { format } from "date-fns";

interface NotesTabProps {
  studentId: string;
  notes: CounselorNote[];
  createNote: {
    mutate: (data: { studentId: string; content: string; type: NoteType; isPrivate: boolean }, opts?: { onSuccess?: () => void }) => void;
    isPending: boolean;
  };
  deleteNote: {
    mutate: (data: { noteId: string; studentId: string }) => void;
  };
}

export function NotesTab({ studentId, notes, createNote, deleteNote }: NotesTabProps) {
  const { t } = useTranslation("counselor");
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("general");

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createNote.mutate(
      { studentId, content: newNote.trim(), type: noteType, isPrivate: false },
      { onSuccess: () => setNewNote("") }
    );
  };

  return (
    <TabsContent value="notes" className="mt-6 space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-emerald-600" />
            {t("notes.addNote", "Add Note")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={noteType}
            onValueChange={(v) => setNoteType(v as NoteType)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">{t("notes.general", "General")}</SelectItem>
              <SelectItem value="meeting">{t("notes.meeting", "Meeting")}</SelectItem>
              <SelectItem value="follow_up">{t("notes.followUp", "Follow Up")}</SelectItem>
              <SelectItem value="academic">{t("notes.academic", "Academic")}</SelectItem>
              <SelectItem value="career">{t("notes.career", "Career")}</SelectItem>
              <SelectItem value="personal">{t("notes.personal", "Personal")}</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            placeholder={t("notes.placeholder", "Type your note here...")}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
          />
          <Button
            size="sm"
            onClick={handleAddNote}
            disabled={!newNote.trim() || createNote.isPending}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {createNote.isPending ? t("notes.saving", "Saving…") : t("notes.saveNote", "Save Note")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("notes.historyTitle", { n: notes.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">
              {t("notes.noNotes", "No counselor notes yet for this student.")}
            </p>
          ) : (
            <div className="space-y-3">
              {notes.map((note: CounselorNote) => (
                <div key={note.id} className="p-4 border rounded-xl space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs capitalize">
                        {note.type}
                      </Badge>
                      {note.isPrivate && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                          {t("notes.private", "Private")}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {note.createdDate && format(new Date(note.createdDate), "MMM d, yyyy")}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-600"
                        onClick={() => deleteNote.mutate({ noteId: note.id, studentId })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                  {note.followUpDate && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t("notes.followUpLabel", "Follow-up:")} {format(new Date(note.followUpDate), "MMM d, yyyy")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
