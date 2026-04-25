"use client";

import React, { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Mail, Calendar, Clock, Star, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { getCoachStudentDetails } from "@/services/coachService";
import { toast } from "sonner";

interface StudentDetailsSheetProps {
  studentId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function StudentDetailsSheet({
  studentId,
  isOpen,
  onClose,
}: StudentDetailsSheetProps) {
  const [student, setStudent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!studentId || !isOpen) return;
      
      try {
        setIsLoading(true);
        const data = await getCoachStudentDetails(studentId);
        setStudent(data);
      } catch (error) {
        console.error("Failed to fetch student details:", error);
        toast.error("Failed to load student details");
        setStudent(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [studentId, isOpen]);

  if (!studentId) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Student Profile</SheetTitle>
          <SheetDescription>
            Detailed information and session history.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : student ? (
          <div className="space-y-8">
            {/* Header / Identity */}
            <div className="flex flex-col items-center text-center">
              <Avatar className="w-24 h-24 mb-4 border-4 border-white shadow-xl">
                <AvatarImage src={student.image} alt={student.name} />
                <AvatarFallback className="text-2xl bg-blue-100 text-blue-600">
                  {student.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-2xl font-bold text-gray-900">{student.name}</h2>
              <div className="flex items-center gap-2 text-gray-500 mt-1">
                <Mail className="w-4 h-4" />
                <span>{student.email}</span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4 flex flex-col items-center">
                  <span className="text-sm text-gray-500 mb-1">Total Sessions</span>
                  <span className="text-2xl font-bold text-gray-900">{student.totalSessions || 0}</span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex flex-col items-center">
                  <span className="text-sm text-gray-500 mb-1">Completed</span>
                  <span className="text-2xl font-bold text-green-600">{student.completedSessions || 0}</span>
                </CardContent>
              </Card>
            </div>

            {/* Past Sessions */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Run History
              </h3>
              <div className="space-y-3">
                {student.sessions && student.sessions.length > 0 ? (
                  student.sessions.map((session: any) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{session.topic || "Coaching Session"}</p>
                          <p className="text-xs text-gray-500">
                            {format(new Date(session.startTime), "PPp")}
                          </p>
                        </div>
                      </div>
                      <Badge variant={session.status === "completed" ? "default" : "secondary"}>
                        {session.status}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm text-center py-4 bg-gray-50 rounded-xl">
                    No session history found.
                  </p>
                )}
              </div>
            </div>

            {/* Notes Section - Placeholder or Real Data */}
             <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                Shared Notes
              </h3>
               <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-100 text-sm text-yellow-800">
                 {student.notes || "No notes shared for this student."}
               </div>
            </div>

          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">Student not found.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Helper icon
function FileText(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}
