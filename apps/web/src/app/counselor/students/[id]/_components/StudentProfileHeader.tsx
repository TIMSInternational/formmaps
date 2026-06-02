"use client";

import { motion } from "motion/react";
import { ArrowLeft, Mail, GraduationCap, Target, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  at_risk: "bg-red-100 text-red-700",
  inactive: "bg-gray-100 text-gray-500",
};

interface StudentProfileHeaderProps {
  student: {
    name: string;
    email: string;
    gradeLevel: number;
    status: string;
    alertCount: number;
    careerPath?: string;
  };
  onBack: () => void;
}

export function StudentProfileHeader({ student, onBack }: StudentProfileHeaderProps) {
  const initials = (student.name || "?")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
      <Button
        variant="ghost"
        className="mb-2 hover:bg-gray-100"
        onClick={onBack}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to My Students
      </Button>

      <div className="bg-white rounded-2xl p-7 border border-gray-100 shadow-sm flex flex-col md:flex-row items-center md:items-start gap-7 mt-2">
        <Avatar className="h-20 w-20 border-4 border-white shadow-lg shrink-0">
          <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-600 text-white text-2xl font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 text-center md:text-left space-y-2">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
            <Badge className={cn("capitalize", STATUS_COLORS[student.status] || "bg-gray-100 text-gray-700")}>
              {student.status?.replace("_", " ")}
            </Badge>
            {student.alertCount > 0 && (
              <Badge className="bg-red-100 text-red-700 gap-1">
                <Bell className="h-3 w-3" />
                {student.alertCount} alert{student.alertCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <div className="flex flex-col md:flex-row gap-4 text-gray-500 text-sm pt-1">
            <div className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-gray-400" />
              {student.email}
            </div>
            <div className="flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5 text-gray-400" />
              Grade {student.gradeLevel}
            </div>
            {student.careerPath && (
              <div className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-gray-400" />
                {student.careerPath}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
