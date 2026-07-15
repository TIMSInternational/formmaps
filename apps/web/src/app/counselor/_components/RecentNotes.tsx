"use client";

import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

interface NoteItem {
  id: string;
  studentName: string;
  type: string;
  content: string;
  createdAt: string;
}

interface RecentNotesProps {
  notes: NoteItem[];
}

export function RecentNotes({ notes }: RecentNotesProps) {
  const { t } = useTranslation("counselor");

  if (!notes.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
    >
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-teal-600" />
            {t("dashboard.recentNotes", "Recent Notes")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-lg shadow-sm"
              >
                <BookOpen className="h-4 w-4 text-teal-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-800 truncate">{note.studentName}</p>
                    <Badge variant="outline" className="text-[10px] capitalize shrink-0">{note.type}</Badge>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{note.content}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {new Date(note.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
