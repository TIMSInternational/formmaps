"use client";

import { motion } from "motion/react";
import {
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Question360 } from "@/services/questions360Service";

interface QuestionCardProps {
  question: Question360;
  onEdit: (question: Question360) => void;
  onDelete: (id: string) => void;
  onToggleActive: (question: Question360) => void;
}

export function QuestionCard({ question, onEdit, onDelete, onToggleActive }: QuestionCardProps) {
  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.99 }}
      className={`group bg-white rounded-2xl border ${question.isActive ? 'border-gray-100' : 'border-gray-200 bg-gray-50/50'} p-6 transition-all hover:shadow-md hover:border-blue-100`}
    >
      <div className="flex flex-col md:flex-row gap-6">
        {/* Status & Number */}
        <div className="flex md:flex-col items-center md:items-start gap-3 md:gap-1 min-w-[80px]">
          <Badge variant="outline" className="h-8 w-8 rounded-full flex items-center justify-center border-gray-200 bg-gray-50 text-gray-600 font-bold shrink-0">
            {question.questionNumber}
          </Badge>
          <div className="md:mt-2">
            {question.isActive ? (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                Active
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                Inactive
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap gap-2 mb-1">
            <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-0 rounded-lg px-2.5 py-0.5 font-medium">
              {question.relationType}
            </Badge>
            <Badge className="bg-purple-50 text-purple-700 hover:bg-purple-100 border-0 rounded-lg px-2.5 py-0.5 font-medium">
              {question.category}
            </Badge>
            {question.isSubQuestion && (
              <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 rounded-lg">
                Sub-Question
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex gap-3">
              <div className="mt-1 h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-xs font-bold text-gray-500">EN</div>
              <p className="text-gray-900 font-medium text-lg leading-relaxed">
                {question.questionEnglishText}
              </p>
            </div>
            {question.questionSpanishText && (
              <div className="flex gap-3">
                <div className="mt-1 h-5 w-5 rounded-full bg-orange-50 flex items-center justify-center shrink-0 text-xs font-bold text-orange-600">ES</div>
                <p className="text-gray-500 italic leading-relaxed">
                  {question.questionSpanishText}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex md:flex-col items-center justify-end md:justify-start gap-2 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-6 min-w-[120px]">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start md:justify-center rounded-xl bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
            onClick={() => onEdit(question)}
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start md:justify-center rounded-xl text-gray-400 hover:text-gray-600">
                <MoreVertical className="h-4 w-4 mr-2 md:mr-0" />
                <span className="md:hidden">More Options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl p-2 w-48">
              <DropdownMenuItem
                onClick={() => onToggleActive(question)}
                className="rounded-lg cursor-pointer"
              >
                {question.isActive ? (
                  <>
                    <XCircle className="h-4 w-4 mr-2 text-orange-500" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                    Activate
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(question.id)}
                className="rounded-lg text-red-600 focus:text-red-700 cursor-pointer"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.div>
  );
}
