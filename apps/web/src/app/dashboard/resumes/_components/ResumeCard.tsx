"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MoreVertical, Trash2, Copy, Edit3, Calendar,
} from "lucide-react";
import type { Resume } from "@/services/resumeService";

interface ResumeCardProps {
  resume: Resume;
  showMenu: boolean;
  onToggleMenu: () => void;
  onEdit: (resumeId: string) => void;
  onDuplicate: (resume: Resume) => void;
  onDelete: (resumeId: string) => void;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ResumeCard({ resume, showMenu, onToggleMenu, onEdit, onDuplicate, onDelete }: ResumeCardProps) {
  return (
    <motion.div
      key={resume._id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="dash-card hover:border-foreground/20 transition-colors group cursor-pointer relative"
      onClick={() => onEdit(resume._id)}
    >
      {/* Resume Mini Preview */}
      <div
        className="h-48 bg-white border-b border-border relative overflow-hidden rounded-t-xl px-3 pt-3"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        <div style={{ transform: "scale(0.95)", transformOrigin: "top left", width: "105%", pointerEvents: "none" }}>
          <div className="text-center border-b border-black pb-[2px] mb-[2px]">
            <div className="text-[12px] font-bold tracking-wide uppercase text-black leading-tight">
              {resume.personal?.fullName || resume.name}
            </div>
          </div>
          <div className="text-center text-[7px] text-gray-500 mb-[4px]">
            {[resume.personal?.phone, resume.personal?.email].filter(Boolean).join(" | ")}
          </div>
          {resume.summary && (
            <div className="mb-[4px]">
              <div className="text-[8px] font-bold uppercase border-b border-black/50 pb-[1px] mb-[2px] text-black">Summary</div>
              <div className="text-[7px] leading-[1.2] text-gray-700 line-clamp-2">{resume.summary}</div>
            </div>
          )}
          {resume.experience?.length > 0 && (
            <div className="mb-[4px]">
              <div className="text-[8px] font-bold uppercase border-b border-black/50 pb-[1px] mb-[2px] text-black">Experience</div>
              {resume.experience.slice(0, 3).map((exp, i) => (
                <div key={i} className="mb-[3px]">
                  <div className="flex justify-between text-[7.5px] text-black">
                    <span className="font-bold truncate">{exp.company}</span>
                    <span className="shrink-0 ml-2 text-gray-500 text-[7px]">{exp.startDate}</span>
                  </div>
                  <div className="text-[7px] italic text-gray-600 truncate">{exp.title}</div>
                </div>
              ))}
            </div>
          )}
          {Object.values(resume.skills?.skills || {}).flat().length > 0 && (
            <div>
              <div className="text-[8px] font-bold uppercase border-b border-black/50 pb-[1px] mb-[2px] text-black">Skills</div>
              <div className="text-[7px] leading-[1.2] text-gray-600 line-clamp-2">
                {Object.values(resume.skills?.skills || {}).flat().slice(0, 15).join(", ")}
              </div>
            </div>
          )}
        </div>

        {/* Template Badge */}
        <div className="absolute top-2 right-2">
          <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-border bg-card text-muted-foreground">
            {resume.template}
          </span>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-foreground text-background rounded-xl text-xs font-medium transition-opacity">
            Edit Resume
          </span>
        </div>
      </div>

      {/* Resume Info */}
      <div className="p-4">
        <h3 className="text-sm font-bold text-foreground truncate mb-1.5">
          {resume.name}
        </h3>

        <div className="flex items-center text-xs text-muted-foreground mb-3">
          <Calendar className="w-3 h-3 mr-1.5" />
          Updated {formatDate(resume.updatedAt || resume.createdAt || new Date().toISOString())}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(resume._id);
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
            title="Edit resume"
          >
            <Edit3 className="w-3 h-3" />
            <span className="hidden sm:inline">Edit</span>
          </button>

          {/* Menu Button */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMenu();
              }}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
              title="More options"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -8 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-1.5 w-36 bg-card border border-border rounded-xl z-50 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onDuplicate(resume)}
                    className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center gap-2 transition-colors border-b border-border"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => onDelete(resume._id)}
                    className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
