"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  MoreVertical,
  Trash2,
  Copy,
  Edit3,
  Calendar,
  FileText,
  Sparkles,
  Upload,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useGlobalStore } from "@/store/useGlobalStore";
import { cn } from "@/lib/utils";
import {
  getAllResumes,
  deleteResume,
  createResume,
  getDefaultResume,
  Resume,
  CreateResumePayload
} from "@/services/resumeService";
import { apiRequest } from "@/lib/api/apiClient";
import { useTranslation } from "react-i18next";

export default function MyResumesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useGlobalStore();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedResume, setSelectedResume] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState<string | null>(null);

  // Fetch resumes from API
  useEffect(() => {
    const fetchResumes = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getAllResumes();
        setResumes(data);
      } catch (err) {
        setError("Failed to load resumes. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchResumes();
  }, []);

  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadResume = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/resume/upload-and-parse`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      const result = await response.json();
      if (result.data) {
        // Re-fetch the full list so the new resume appears in the grid
        const updated = await getAllResumes();
        setResumes(updated);
      } else {
        alert("Failed to parse resume. Please try again.");
      }
    } catch (err) {
      alert("Failed to upload resume");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCreateFromScratch = async () => {
    try {
      const payload = {
        id: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
        userId: "placeholder",
        name: "New Resume",
        template: "classic",
        personalInfo: {
          fullName: user?.name || "Your Name",
          email: user?.email || "your@email.com",
          phone: "",
          location: "",
          linkedIn: "",
          website: "",
          gitHub: "",
          summary: "",
        },
        experience: [],
        education: [],
        skills: [],
        sections: [],
        fieldVisibility: {},
        customFields: [],
      };
      const response = await apiRequest("/api/resume", {
        method: "POST",
        data: payload,
      });
      const resume = response.data || response;
      const resumeId = resume.ID || resume._id || resume.id;
      if (resumeId) {
        router.push(`/dashboard/resume-builder/${resumeId}`);
      }
    } catch {
      alert("Failed to create resume");
    }
  };

  const handleTailorForJob = () => {
    router.push("/dashboard/resume-builder/new");
  };

  const handleEditResume = (resumeId: string) => {
    router.push(`/dashboard/resume-builder/${resumeId}`);
  };

  const handleDeleteResume = async (resumeId: string) => {
    if (confirm("Are you sure you want to delete this resume?")) {
      try {
        await deleteResume(resumeId);
        setResumes(resumes.filter((r) => r._id !== resumeId));
        setShowMenu(null);
      } catch (err) {
        alert("Failed to delete resume. Please try again.");
      }
    }
  };

  const handleDuplicateResume = async (resume: Resume) => {
    const newResume: Resume = {
      ...resume,
      _id: `${resume._id}_copy_${Date.now()}`,
      name: `${resume.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setResumes([newResume, ...resumes]);
    setShowMenu(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const renderResumeCard = (resume: Resume) => (
    <motion.div
      key={resume._id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="dash-card hover:border-foreground/20 transition-colors group cursor-pointer relative"
      onClick={() => handleEditResume(resume._id)}
    >
      {/* Resume Mini Preview */}
      <div className="h-48 bg-white border-b border-border relative overflow-hidden rounded-t-xl px-3 pt-3"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}>
        {/* Mini resume content — scaled to fill */}
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
          Updated{" "}
          {formatDate(
            resume.updatedAt || resume.createdAt || new Date().toISOString()
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditResume(resume._id);
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
                setShowMenu(showMenu === resume._id ? null : resume._id);
              }}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
              title="More options"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {showMenu === resume._id && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -8 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-1.5 w-36 bg-card border border-border rounded-xl z-50 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleDuplicateResume(resume)}
                    className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center gap-2 transition-colors border-b border-border"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => handleDeleteResume(resume._id)}
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

  return (
    <div className="space-y-6">

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
        >
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Documents</p>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none mt-1">{t('dashboard.resumes.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1.5">{t('dashboard.resumes.description')}</p>
          </div>

          <div className="relative shrink-0">
            <button
              onClick={() => setShowCreateMenu(!showCreateMenu)}
              className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background hover:bg-foreground/90 rounded-xl text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('dashboard.resumes.createButton')}
            </button>
            {showCreateMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-xl z-50 overflow-hidden">
                <button
                  onClick={() => { setShowCreateMenu(false); handleCreateFromScratch(); }}
                  className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-secondary transition-colors flex items-center gap-3 border-b border-border"
                >
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">From Scratch</div>
                    <div className="text-[11px] text-muted-foreground">Build your base resume</div>
                  </div>
                </button>
                <button
                  onClick={() => { setShowCreateMenu(false); fileInputRef.current?.click(); }}
                  className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-secondary transition-colors flex items-center gap-3 border-b border-border"
                >
                  <Upload className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Upload Resume (PDF)</div>
                    <div className="text-[11px] text-muted-foreground">Import an existing resume</div>
                  </div>
                </button>
                <button
                  onClick={() => { setShowCreateMenu(false); handleTailorForJob(); }}
                  className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-secondary transition-colors flex items-center gap-3"
                >
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">AI Tailor for Job</div>
                    <div className="text-[11px] text-muted-foreground">Optimize for a job posting</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </motion.header>

        {/* Resume Grid */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="dash-card aspect-video animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="dash-card p-5 text-center py-16">
              <FileText className="w-8 h-8 text-red-500 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-foreground mb-1">
                Failed to load resumes
              </h3>
              <p className="text-xs text-muted-foreground mb-5">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background hover:bg-foreground/90 rounded-xl text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : resumes.length === 0 ? (
            <div className="dash-card p-5 text-center py-16">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-sm font-bold text-foreground mb-1">
                No resumes yet
              </h3>
              <p className="text-xs text-muted-foreground mb-5 max-w-sm mx-auto">
                Upload your existing resume to get started, then use AI to tailor it for specific job postings
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background hover:bg-foreground/90 rounded-xl text-sm font-medium transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Upload Resume (PDF)
                </button>
                <button
                  onClick={handleCreateFromScratch}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary text-foreground hover:bg-border rounded-xl text-sm font-medium transition-colors border border-border"
                >
                  <Plus className="w-4 h-4" />
                  Create from Scratch
                </button>
                <button
                  onClick={handleTailorForJob}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary text-foreground hover:bg-border rounded-xl text-sm font-medium transition-colors border border-border"
                >
                  <Sparkles className="w-4 h-4" />
                  AI Tailor for Job
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {resumes.map((resume) => renderResumeCard(resume))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

      {/* Hidden file input for PDF upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUploadResume(file);
        }}
      />

      {/* Uploading overlay */}
      <AnimatePresence>
        {uploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="dash-card p-8 text-center max-w-sm mx-4"
            >
              <Loader2 className="w-8 h-8 text-foreground animate-spin mx-auto mb-4" />
              <h3 className="text-sm font-bold text-foreground mb-1">
                Parsing your resume...
              </h3>
              <p className="text-xs text-muted-foreground">
                Extracting information from your PDF. This may take a moment.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
