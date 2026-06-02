"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus, FileText, Sparkles, Upload, Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  getAllResumes, deleteResume, Resume,
} from "@/services/resumeService";
import { apiRequest } from "@/lib/api/apiClient";
import { useTranslation } from "react-i18next";
import { ResumeCard } from "./_components/ResumeCard";

export default function MyResumesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useGlobalStore();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState<string | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchResumes = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getAllResumes();
        setResumes(data);
      } catch {
        setError("Failed to load resumes. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchResumes();
  }, []);

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
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        }
      );
      const result = await response.json();
      if (result.data) {
        const updated = await getAllResumes();
        setResumes(updated);
      } else {
        alert("Failed to parse resume. Please try again.");
      }
    } catch {
      alert("Failed to upload resume");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
          phone: "", location: "", linkedIn: "", website: "", gitHub: "", summary: "",
        },
        experience: [], education: [], skills: [], sections: [],
        fieldVisibility: {}, customFields: [],
      };
      const response = await apiRequest("/api/resume", { method: "POST", data: payload });
      const resume = response.data || response;
      const resumeId = resume.ID || resume._id || resume.id;
      if (resumeId) router.push(`/dashboard/resume-builder/${resumeId}`);
    } catch {
      alert("Failed to create resume");
    }
  };

  const handleTailorForJob = () => router.push("/dashboard/resume-builder/new");
  const handleEditResume = (resumeId: string) => router.push(`/dashboard/resume-builder/${resumeId}`);

  const handleDeleteResume = async (resumeId: string) => {
    if (confirm("Are you sure you want to delete this resume?")) {
      try {
        await deleteResume(resumeId);
        setResumes(resumes.filter((r) => r._id !== resumeId));
        setShowMenu(null);
      } catch {
        alert("Failed to delete resume. Please try again.");
      }
    }
  };

  const handleDuplicateResume = (resume: Resume) => {
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
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none mt-1">{t("dashboard.resumes.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1.5">{t("dashboard.resumes.description")}</p>
        </div>

        <div className="relative shrink-0">
          <button
            onClick={() => setShowCreateMenu(!showCreateMenu)}
            className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background hover:bg-foreground/90 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("dashboard.resumes.createButton")}
          </button>
          {showCreateMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-xl z-50 overflow-hidden">
              <button onClick={() => { setShowCreateMenu(false); handleCreateFromScratch(); }}
                className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-secondary transition-colors flex items-center gap-3 border-b border-border">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">From Scratch</div>
                  <div className="text-[11px] text-muted-foreground">Build your base resume</div>
                </div>
              </button>
              <button onClick={() => { setShowCreateMenu(false); fileInputRef.current?.click(); }}
                className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-secondary transition-colors flex items-center gap-3 border-b border-border">
                <Upload className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">Upload Resume (PDF)</div>
                  <div className="text-[11px] text-muted-foreground">Import an existing resume</div>
                </div>
              </button>
              <button onClick={() => { setShowCreateMenu(false); handleTailorForJob(); }}
                className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-secondary transition-colors flex items-center gap-3">
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
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="dash-card aspect-video animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="dash-card p-5 text-center py-16">
            <FileText className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-foreground mb-1">Failed to load resumes</h3>
            <p className="text-xs text-muted-foreground mb-5">{error}</p>
            <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background hover:bg-foreground/90 rounded-xl text-sm font-medium transition-colors">
              Try Again
            </button>
          </div>
        ) : resumes.length === 0 ? (
          <div className="dash-card p-5 text-center py-16">
            <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-sm font-bold text-foreground mb-1">No resumes yet</h3>
            <p className="text-xs text-muted-foreground mb-5 max-w-sm mx-auto">
              Upload your existing resume to get started, then use AI to tailor it for specific job postings
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background hover:bg-foreground/90 rounded-xl text-sm font-medium transition-colors">
                <Upload className="w-4 h-4" /> Upload Resume (PDF)
              </button>
              <button onClick={handleCreateFromScratch} className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary text-foreground hover:bg-border rounded-xl text-sm font-medium transition-colors border border-border">
                <Plus className="w-4 h-4" /> Create from Scratch
              </button>
              <button onClick={handleTailorForJob} className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary text-foreground hover:bg-border rounded-xl text-sm font-medium transition-colors border border-border">
                <Sparkles className="w-4 h-4" /> AI Tailor for Job
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {resumes.map((resume) => (
                <ResumeCard
                  key={resume._id}
                  resume={resume}
                  showMenu={showMenu === resume._id}
                  onToggleMenu={() => setShowMenu(showMenu === resume._id ? null : resume._id)}
                  onEdit={handleEditResume}
                  onDuplicate={handleDuplicateResume}
                  onDelete={handleDeleteResume}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUploadResume(file); }} />

      <AnimatePresence>
        {uploading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="dash-card p-8 text-center max-w-sm mx-4">
              <Loader2 className="w-8 h-8 text-foreground animate-spin mx-auto mb-4" />
              <h3 className="text-sm font-bold text-foreground mb-1">Parsing your resume...</h3>
              <p className="text-xs text-muted-foreground">Extracting information from your PDF. This may take a moment.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
