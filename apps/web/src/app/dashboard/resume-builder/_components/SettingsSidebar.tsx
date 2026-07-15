"use client";

import React, { useState } from "react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import {
  X,
  GripVertical,
  Eye,
  EyeOff,
  Download,
  Settings as SettingsIcon,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SettingsSidebar Component
 *
 * Manages resume customization:
 * - Section visibility toggle
 * - Section reordering (drag-and-drop)
 * - Field customization per section
 * - Export options
 * - Global settings
 *
 * Best practices:
 * - Drag-and-drop with Framer Motion Reorder
 * - Accessible keyboard navigation
 * - Clear visual feedback
 * - Memoized for performance
 * - Type-safe props and state
 */

interface SettingsSidebarProps {
  onClose: () => void;
  className?: string;
}

export const SettingsSidebar = React.memo(
  ({ onClose, className = "" }: SettingsSidebarProps) => {
    // State for expandable sections
    const [expandedSection, setExpandedSection] = useState<string | null>(
      "sections"
    );

    // Mock data for sections (in real app, would come from props or store)
    const [sections, setSections] = useState([
      {
        id: "personalInfo",
        title: "Personal Information",
        visible: true,
        icon: "👤",
      },
      {
        id: "experience",
        title: "Work Experience",
        visible: true,
        icon: "💼",
      },
      { id: "education", title: "Education", visible: true, icon: "🎓" },
      { id: "skills", title: "Skills", visible: true, icon: "⭐" },
      { id: "projects", title: "Projects", visible: false, icon: "📁" },
      {
        id: "certifications",
        title: "Certifications",
        visible: false,
        icon: "🏆",
      },
    ]);

    const [fieldCustomization, setFieldCustomization] = useState<
      Record<string, Record<string, boolean>>
    >({
      experience: {
        company: true,
        title: true,
        location: true,
        dates: true,
        description: true,
      },
      education: {
        degree: true,
        institution: true,
        location: true,
        graduationDate: true,
        gpa: true,
      },
    });

    /**
     * Toggle section visibility
     */
    const handleToggleSection = (sectionId: string) => {
      setSections(
        sections.map((section) =>
          section.id === sectionId
            ? { ...section, visible: !section.visible }
            : section
        )
      );
    };

    /**
     * Toggle field visibility within a section
     */
    const handleToggleField = (sectionId: string, fieldName: string) => {
      setFieldCustomization((prev) => ({
        ...prev,
        [sectionId]: {
          ...prev[sectionId],
          [fieldName]: !prev[sectionId][fieldName],
        },
      }));
    };

    /**
     * Render sections management
     */
    const renderSectionsManagement = () => (
      <div className="space-y-2">
        <Reorder.Group
          axis="y"
          values={sections}
          onReorder={setSections}
          className="space-y-2"
        >
          {sections.map((section) => (
            <Reorder.Item key={section.id} value={section}>
              <motion.div
                layout
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-all duration-200",
                  section.visible
                    ? "bg-white border-indigo-200 hover:border-indigo-300"
                    : "bg-gray-50 border-gray-200"
                )}
              >
                {/* Drag Handle */}
                <div
                  className="cursor-grab active:cursor-grabbing p-1"
                  title="Drag to reorder"
                >
                  <GripVertical className="w-4 h-4 text-gray-400" />
                </div>

                {/* Section Info */}
                <div className="flex-1 ml-2 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{section.icon}</span>
                    <span
                      className={cn(
                        "text-sm font-medium truncate",
                        section.visible
                          ? "text-gray-900"
                          : "text-gray-600 line-through"
                      )}
                    >
                      {section.title}
                    </span>
                  </div>
                </div>

                {/* Visibility Toggle */}
                <motion.button
                  onClick={() => handleToggleSection(section.id)}
                  className={cn(
                    "p-2 rounded-lg transition-all duration-200",
                    section.visible
                      ? "bg-indigo-100 text-indigo-600"
                      : "bg-gray-100 text-gray-400"
                  )}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  title={section.visible ? "Hide section" : "Show section"}
                  aria-label={`${section.visible ? "Hide" : "Show"} ${
                    section.title
                  }`}
                >
                  {section.visible ? (
                    <Eye className="w-4 h-4" />
                  ) : (
                    <EyeOff className="w-4 h-4" />
                  )}
                </motion.button>
              </motion.div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </div>
    );

    /**
     * Render field customization
     */
    const renderFieldCustomization = () => (
      <div className="space-y-4">
        {Object.entries(fieldCustomization).map(([sectionId, fields]) => (
          <motion.div
            key={sectionId}
            className="border border-gray-200 rounded-lg overflow-hidden"
          >
            <button
              onClick={() =>
                setExpandedSection(
                  expandedSection === sectionId ? null : sectionId
                )
              }
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors duration-150 bg-white"
              aria-expanded={expandedSection === sectionId}
            >
              <span className="text-sm font-medium text-gray-900">
                {sectionId.charAt(0).toUpperCase() + sectionId.slice(1)} Fields
              </span>
              <motion.div
                animate={{ rotate: expandedSection === sectionId ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </motion.div>
            </button>

            <AnimatePresence>
              {expandedSection === sectionId && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-gray-200 bg-gray-50"
                >
                  <div className="p-3 space-y-2">
                    {Object.entries(fields).map(([fieldName, isVisible]) => (
                      <label
                        key={fieldName}
                        className="flex items-center space-x-3 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() =>
                            handleToggleField(sectionId, fieldName)
                          }
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className="text-sm text-gray-700 group-hover:text-gray-900 capitalize">
                          {fieldName.replace(/([A-Z])/g, " $1")}
                        </span>
                      </label>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    );

    /**
     * Render export options
     */
    const renderExportOptions = () => (
      <div className="space-y-3">
        <button className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-all duration-200">
          <div className="flex items-center space-x-3">
            <Download className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-medium text-gray-900">
              Download as PDF
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>

        <button className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-all duration-200">
          <div className="flex items-center space-x-3">
            <Download className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-medium text-gray-900">
              Download as DOCX
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>

        <button className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-all duration-200">
          <div className="flex items-center space-x-3">
            <Download className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-medium text-gray-900">
              Copy as Text
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    );

    return (
      <motion.div
        className={cn("flex flex-col h-full bg-white", className)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-gray-900">Settings</h2>
          </div>
          <motion.button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-150"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            title="Close settings"
            aria-label="Close settings"
          >
            <X className="w-5 h-5 text-gray-500" />
          </motion.button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Sections Management */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h3 className="font-semibold text-gray-900 text-sm mb-3 flex items-center">
                <span className="w-1 h-4 bg-indigo-600 rounded-full mr-2"></span>
                Sections
              </h3>
              {renderSectionsManagement()}
            </motion.div>

            {/* Field Customization */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="font-semibold text-gray-900 text-sm mb-3 flex items-center">
                <span className="w-1 h-4 bg-indigo-600 rounded-full mr-2"></span>
                Field Visibility
              </h3>
              {renderFieldCustomization()}
            </motion.div>

            {/* Export Options */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h3 className="font-semibold text-gray-900 text-sm mb-3 flex items-center">
                <span className="w-1 h-4 bg-indigo-600 rounded-full mr-2"></span>
                Export
              </h3>
              {renderExportOptions()}
            </motion.div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-2">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 font-medium text-sm"
          >
            Apply Settings
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:border-gray-300 transition-colors duration-200 font-medium text-sm"
          >
            Close
          </button>
        </div>
      </motion.div>
    );
  }
);

SettingsSidebar.displayName = "SettingsSidebar";

export default SettingsSidebar;
