"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  MoreVertical,
  Trash2,
  Copy,
  Edit3,
  Calendar,
  FileText,
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
import { useTranslation } from "react-i18next";

/**
 * My Resumes Page
 *
 * Displays all user resumes in a grid/list view
 * Allows users to:
 * - Create new resumes
 * - Edit existing resumes
 * - Delete resumes
 * - Duplicate resumes
 *
 * Features:
 * - Dashboard sidebar for navigation
 * - Responsive grid layout
 * - Resume management actions
 * - Real-time resume updates
 * - Empty state handling
 */

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
        console.error("Error fetching resumes:", err);
        setError("Failed to load resumes. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchResumes();
  }, []);

  /**
   * Create new resume
   */
  const handleCreateResume = async () => {
     router.push("/dashboard/resume-builder/new");
  };

  /**
   * Edit existing resume
   */
  const handleEditResume = (resumeId: string) => {
    router.push(`/resume-builder/${resumeId}`);
  };

  /**
   * Delete resume
   */
  const handleDeleteResume = async (resumeId: string) => {
    if (confirm("Are you sure you want to delete this resume?")) {
      try {
        await deleteResume(resumeId);
        setResumes(resumes.filter((r) => r._id !== resumeId));
        setShowMenu(null);
      } catch (err) {
        console.error("Error deleting resume:", err);
        alert("Failed to delete resume. Please try again.");
      }
    }
  };

  /**
   * Duplicate resume
   */
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

  /**
   * Format date for display
   */
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  /**
   * Render resume card
   */
  const renderResumeCard = (resume: Resume) => (
    <motion.div
      key={resume._id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden group cursor-pointer"
      onClick={() => handleEditResume(resume._id)}
    >
      {/* Resume Preview Placeholder */}
      <div className="aspect-video bg-gradient-to-br from-indigo-50 to-blue-50 border-b border-gray-200 flex items-center justify-center relative overflow-hidden">
        <FileText className="w-12 h-12 text-gray-300 group-group-hover:text-gray-400 transition-colors" />

        {/* Template Badge */}
        <div className="absolute top-2 right-2">
          <span className="inline-block px-2 py-1 bg-indigo-600 text-white text-xs font-medium rounded">
            {resume.template}
          </span>
        </div>

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
          <button className="opacity-0 group-hover:opacity-100 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm transition-opacity duration-200">
            Edit Resume
          </button>
        </div>
      </div>

      {/* Resume Info */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 truncate mb-2">
          {resume.name}
        </h3>

        {/* Meta Info */}
        <div className="space-y-1 mb-3">
          <div className="flex items-center text-xs text-gray-600">
            <Calendar className="w-3 h-3 mr-1.5" />
            Updated{" "}
            {formatDate(
              resume.updatedAt || resume.createdAt || new Date().toISOString()
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditResume(resume._id);
              }}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
              title="Edit resume"
            >
              <Edit3 className="w-3 h-3" />
              <span className="hidden sm:inline">Edit</span>
            </button>
          </div>

          {/* Menu Button */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(showMenu === resume._id ? null : resume._id);
              }}
              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="More options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {showMenu === resume._id && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleDuplicateResume(resume)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors border-b border-gray-100"
                  >
                    <Copy className="w-4 h-4" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => handleDeleteResume(resume._id)}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
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
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header with Create Button */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.resumes.title')}</h1>
                <p className="text-gray-600 mt-1">{t('dashboard.resumes.description')}</p>
              </div>

              {/* Create Button */}
              <motion.button
                onClick={handleCreateResume}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow duration-200 font-medium"
              >
                <Plus className="w-5 h-5" />
                {t('dashboard.resumes.createButton')}
              </motion.button>
            </div>

            {/* Resume Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-lg border border-gray-200 aspect-video animate-pulse"
                  />
                ))}
              </div>
            ) : error ? (
              // Error State
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <div className="inline-block p-3 bg-red-100 rounded-lg mb-4">
                  <FileText className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Failed to load resumes
                </h3>
                <p className="text-gray-600 mb-6">{error}</p>
                <motion.button
                  onClick={() => window.location.reload()}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow duration-200 font-medium"
                >
                  Try Again
                </motion.button>
              </motion.div>
            ) : resumes.length === 0 ? (
              // Empty State
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <div className="inline-block p-3 bg-indigo-100 rounded-lg mb-4">
                  <FileText className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No resumes yet
                </h3>
                <p className="text-gray-600 mb-6">
                  Start by creating your first resume
                </p>
                <motion.button
                  onClick={handleCreateResume}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow duration-200 font-medium"
                >
                  <Plus className="w-5 h-5" />
                  Create Your First Resume
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                <AnimatePresence mode="popLayout">
                  {resumes.map((resume) => renderResumeCard(resume))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
    </div>
  );
}
