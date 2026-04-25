"use client";

import React, { useState, useMemo } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { motion, AnimatePresence } from "motion/react";
import { SectionCard } from "./SectionCard";
import { SettingsSidebar } from "./SettingsSidebar";
import { SectionEditor } from "./SectionEditor";
import { LivePreviewPDF } from "./LivePreviewPDF";
import {
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Settings,
  FileText,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ResumeDashboard - Main component replacing the stepper approach
 *
 * Features:
 * - Non-linear navigation (access any section anytime)
 * - Live resume preview (optional side panel)
 * - Settings sidebar for customization
 * - Responsive design (mobile-first)
 * - Smooth animations and transitions
 *
 * Best practices used:
 * - Memoization to prevent unnecessary re-renders
 * - Semantic HTML structure
 * - ARIA labels for accessibility
 * - Keyboard navigation support
 * - Mobile-responsive layout
 */

interface ResumeDashboardProps {
  className?: string;
}

export function ResumeDashboard({ className = "" }: ResumeDashboardProps) {
  const { resumeBuilder } = useGlobalStore();
  const { data } = resumeBuilder;

  // State management
  const [expandedSection, setExpandedSection] = useState<string | null>(
    "personalInfo"
  );
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editorState, setEditorState] = useState<{
    isOpen: boolean;
    sectionId: string;
    sectionTitle: string;
  }>({
    isOpen: false,
    sectionId: "",
    sectionTitle: "",
  });

  /**
   * Define all available sections with metadata
   * This allows easy extension for new section types
   */
  const sectionDefinitions = useMemo(
    () => [
      {
        id: "personalInfo",
        title: "Personal Information",
        icon: "👤",
        description: "Your contact details and professional summary",
        data: data.personalInfo,
        isRequired: true,
        isComplete: !!data.personalInfo.fullName && !!data.personalInfo.email,
      },
      {
        id: "experience",
        title: "Work Experience",
        icon: "💼",
        description: `${data.experience.length} position${
          data.experience.length !== 1 ? "s" : ""
        }`,
        data: data.experience,
        isRequired: false,
        isComplete: data.experience.length > 0,
      },
      {
        id: "education",
        title: "Education",
        icon: "🎓",
        description: `${data.education.length} degree${
          data.education.length !== 1 ? "s" : ""
        }`,
        data: data.education,
        isRequired: false,
        isComplete: data.education.length > 0,
      },
      {
        id: "skills",
        title: "Skills",
        icon: "⭐",
        description: `${data.skills.length} skill${
          data.skills.length !== 1 ? "s" : ""
        }`,
        data: data.skills,
        isRequired: true,
        isComplete: data.skills.length > 0,
      },
    ],
    [data]
  );

  /**
   * Calculate overall completion percentage
   */
  const completionPercentage = useMemo(() => {
    const requiredSections = sectionDefinitions.filter((s) => s.isRequired);
    const completedRequired = requiredSections.filter((s) => s.isComplete);
    return Math.round(
      (completedRequired.length / requiredSections.length) * 100
    );
  }, [sectionDefinitions]);

  /**
   * Handle section expansion with single-open logic
   */
  const handleSectionToggle = (sectionId: string) => {
    setExpandedSection(expandedSection === sectionId ? null : sectionId);
  };

  /**
   * Open section editor modal
   */
  const handleOpenEditor = (sectionId: string, sectionTitle: string) => {
    setEditorState({
      isOpen: true,
      sectionId,
      sectionTitle,
    });
  };

  /**
   * Close section editor modal
   */
  const handleCloseEditor = () => {
    setEditorState({
      isOpen: false,
      sectionId: "",
      sectionTitle: "",
    });
  };

  /**
   * Save section data from editor
   */
  const handleSaveSection = async (sectionId: string, data: any) => {
    // This will be connected to your actual store update logic
    await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate API call
    console.log("Saved section data:", sectionId, data);
  };

  /**
   * Render header with controls
   */
  const renderHeader = () => (
    <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-4 flex items-center justify-between">
          {/* Left: Title and Progress */}
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-indigo-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Resume Builder
                </h1>
                <p className="text-sm text-gray-600">
                  {completionPercentage}% complete
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-3 w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-indigo-600 to-blue-600 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${completionPercentage}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center space-x-3">
            {/* Preview Toggle */}
            <motion.button
              onClick={() => setShowPreview(!showPreview)}
              className={cn(
                "flex items-center space-x-2 px-4 py-2 rounded-lg",
                "transition-all duration-200",
                showPreview
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Toggle live preview"
              aria-label={showPreview ? "Hide preview" : "Show preview"}
            >
              {showPreview ? (
                <Eye className="w-4 h-4" />
              ) : (
                <EyeOff className="w-4 h-4" />
              )}
              <span className="hidden sm:inline text-sm font-medium">
                {showPreview ? "Preview On" : "Preview"}
              </span>
            </motion.button>

            {/* Settings Button */}
            <motion.button
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "flex items-center space-x-2 px-4 py-2 rounded-lg",
                "transition-all duration-200",
                showSettings
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Customize sections"
              aria-label="Open settings"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">
                Customize
              </span>
            </motion.button>

            {/* Export Button */}
            <motion.button
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all duration-200"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Download resume as PDF"
              aria-label="Download resume"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">
                Download
              </span>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );

  /**
   * Render main content area with sections
   */
  const renderContent = () => (
    <div
      className={cn(
        "flex-1 overflow-y-auto",
        showPreview ? "lg:flex gap-6" : ""
      )}
    >
      {/* Main Dashboard */}
      <div className="flex-1 min-w-0">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Section Cards */}
          <AnimatePresence mode="popLayout">
            <div className="space-y-4">
              {sectionDefinitions.map((section, index) => (
                <motion.div
                  key={section.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <SectionCard
                    section={section}
                    isExpanded={expandedSection === section.id}
                    onToggle={() => handleSectionToggle(section.id)}
                    onEdit={() => handleOpenEditor(section.id, section.title)}
                  />
                </motion.div>
              ))}
            </div>
          </AnimatePresence>

          {/* Add Optional Sections */}
          <motion.div
            className="mt-8 p-6 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-100"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
              <Plus className="w-5 h-5 mr-2 text-indigo-600" />
              Add Optional Sections
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Projects", icon: "📁" },
                { label: "Certifications", icon: "🏆" },
                { label: "Volunteer Work", icon: "🤝" },
                { label: "Publications", icon: "📚" },
                { label: "Languages", icon: "🌐" },
              ].map((item) => (
                <motion.button
                  key={item.label}
                  className="flex items-center justify-center space-x-2 px-4 py-3 bg-white rounded-lg border border-indigo-200 hover:border-indigo-400 hover:shadow-md transition-all duration-200 text-gray-700 font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span>{item.icon}</span>
                  <span className="text-sm">{item.label}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Live Preview Panel */}
      {showPreview && (
        <motion.div
          className="w-full lg:w-96 border-l border-gray-200 bg-gray-50 overflow-y-auto"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3">
            <h3 className="font-semibold text-gray-900 text-sm">
              Resume Preview
            </h3>
          </div>
          <div className="p-4">
            <LivePreviewPDF className="rounded-lg shadow-md" />
          </div>
        </motion.div>
      )}
    </div>
  );

  return (
    <div
      className={cn("flex flex-col h-screen bg-gray-50", className)}
      role="main"
      aria-label="Resume builder dashboard"
    >
      {/* Header */}
      {renderHeader()}

      {/* Main Content with Optional Preview and Settings */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content Area */}
        {renderContent()}

        {/* Settings Sidebar */}
        {showSettings && (
          <motion.div
            className="w-full sm:w-80 border-l border-gray-200 bg-white shadow-lg overflow-y-auto"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <SettingsSidebar onClose={() => setShowSettings(false)} />
          </motion.div>
        )}
      </div>

      {/* Section Editor Modal */}
      <SectionEditor
        isOpen={editorState.isOpen}
        sectionId={editorState.sectionId}
        sectionTitle={editorState.sectionTitle}
        data={
          sectionDefinitions.find((s) => s.id === editorState.sectionId)
            ?.data || {}
        }
        onClose={handleCloseEditor}
        onSave={(data) => handleSaveSection(editorState.sectionId, data)}
      />
    </div>
  );
}

export default ResumeDashboard;
