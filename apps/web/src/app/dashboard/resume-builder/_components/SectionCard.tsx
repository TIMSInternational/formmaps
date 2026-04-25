"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Check, AlertCircle, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SectionCard Component
 *
 * Displays a collapsible card for each resume section with:
 * - Status indicators (complete/incomplete)
 * - Content preview
 * - Expandable inline editor
 * - Smooth animations
 *
 * Best practices:
 * - Accessible keyboard navigation
 * - Proper ARIA labels
 * - Semantic HTML
 * - Performance optimized with React.memo
 * - Type-safe props
 */

interface SectionCardProps {
  section: {
    id: string;
    title: string;
    icon: string;
    description: string;
    data: any;
    isRequired: boolean;
    isComplete: boolean;
  };
  isExpanded: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  className?: string;
}

export const SectionCard = React.memo(
  ({
    section,
    isExpanded,
    onToggle,
    onEdit,
    className = "",
  }: SectionCardProps) => {
    const [isHovering, setIsHovering] = useState(false);

    /**
     * Render content preview based on section type
     */
    const renderPreview = () => {
      switch (section.id) {
        case "personalInfo":
          return (
            <div className="text-sm text-gray-600">
              <div>
                {section.data.fullName || (
                  <span className="text-gray-400 italic">No name added</span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {section.data.email || (
                  <span className="text-gray-400 italic">No email added</span>
                )}
              </div>
            </div>
          );

        case "experience":
          return (
            <div className="text-sm text-gray-600">
              {section.data.length === 0 ? (
                <span className="text-gray-400 italic">
                  No work experience added
                </span>
              ) : (
                <div className="space-y-1">
                  {section.data.slice(0, 2).map((exp: any, idx: number) => (
                    <div key={idx} className="truncate">
                      {exp.jobTitle} at {exp.company}
                    </div>
                  ))}
                  {section.data.length > 2 && (
                    <div className="text-xs text-gray-500">
                      +{section.data.length - 2} more
                    </div>
                  )}
                </div>
              )}
            </div>
          );

        case "education":
          return (
            <div className="text-sm text-gray-600">
              {section.data.length === 0 ? (
                <span className="text-gray-400 italic">No education added</span>
              ) : (
                <div className="space-y-1">
                  {section.data.slice(0, 2).map((edu: any, idx: number) => (
                    <div key={idx} className="truncate">
                      {edu.degree} from {edu.institution}
                    </div>
                  ))}
                  {section.data.length > 2 && (
                    <div className="text-xs text-gray-500">
                      +{section.data.length - 2} more
                    </div>
                  )}
                </div>
              )}
            </div>
          );

        case "skills":
          return (
            <div className="text-sm text-gray-600">
              {section.data.length === 0 ? (
                <span className="text-gray-400 italic">No skills added</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {section.data.slice(0, 5).map((skill: any, idx: number) => (
                    <span
                      key={idx}
                      className="inline-block px-2 py-1 bg-gray-100 rounded text-xs"
                    >
                      {skill.name}
                    </span>
                  ))}
                  {section.data.length > 5 && (
                    <span className="text-xs text-gray-500">
                      +{section.data.length - 5} more
                    </span>
                  )}
                </div>
              )}
            </div>
          );

        default:
          return <span className="text-gray-600">{section.description}</span>;
      }
    };

    return (
      <motion.div
        className={cn(
          "rounded-xl border transition-all duration-200",
          isHovering
            ? "border-indigo-300 shadow-md bg-white"
            : "border-gray-200 shadow-sm bg-white",
          className
        )}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        layout
      >
        {/* Card Header */}
        <button
          onClick={onToggle}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors duration-150 rounded-t-xl"
          aria-expanded={isExpanded}
          aria-controls={`section-content-${section.id}`}
        >
          <div className="flex-1 text-left">
            <div className="flex items-center space-x-3">
              {/* Icon */}
              <span className="text-2xl">{section.icon}</span>

              {/* Title and Description */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
                  <span>{section.title}</span>
                  {section.isRequired && (
                    <span
                      className="text-red-500 text-sm"
                      title="Required field"
                      aria-label="required"
                    >
                      *
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-600 truncate">
                  {renderPreview()}
                </p>
              </div>
            </div>
          </div>

          {/* Right Side: Status and Chevron */}
          <div className="flex items-center space-x-3 ml-4">
            {/* Status Indicator */}
            {section.isComplete ? (
              <motion.div
                className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                title="Section complete"
              >
                <Check className="w-4 h-4 text-green-600" />
              </motion.div>
            ) : section.isRequired ? (
              <motion.div
                className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-100"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                title="Required field incomplete"
              >
                <AlertCircle className="w-4 h-4 text-yellow-600" />
              </motion.div>
            ) : null}

            {/* Edit Icon */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: isHovering ? 1 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <Edit2 className="w-4 h-4 text-indigo-600" />
            </motion.div>

            {/* Chevron */}
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </motion.div>
          </div>
        </button>

        {/* Expandable Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              id={`section-content-${section.id}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="border-t border-gray-200 overflow-hidden"
            >
              <div className="px-6 py-4 bg-gray-50">
                {/* Placeholder for inline editor */}
                {/* This will be replaced with actual form components */}
                <div className="rounded-lg bg-white p-4 border border-gray-200">
                  <p className="text-gray-600 text-sm mb-4">
                    Inline editor for {section.title}
                  </p>

                  {/* Example: Personal Info Editor */}
                  {section.id === "personalInfo" && (
                    <SectionEditorContent section={section} />
                  )}

                  {/* Example: Experience Editor */}
                  {section.id === "experience" && (
                    <ExperienceEditorContent section={section} />
                  )}

                  {/* For now, show placeholder */}
                  {!["personalInfo", "experience"].includes(section.id) && (
                    <button
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 text-sm font-medium"
                      onClick={onEdit}
                    >
                      Full Editor
                    </button>
                  )}

                  {/* For sections with editors, show button to open full editor */}
                  {["personalInfo", "experience"].includes(section.id) && (
                    <button
                      className="ml-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 text-sm font-medium"
                      onClick={onEdit}
                    >
                      Open Full Editor
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }
);

SectionCard.displayName = "SectionCard";

/**
 * Placeholder editor components (to be expanded)
 */

function SectionEditorContent({ section }: { section: any }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Full Name
        </label>
        <input
          type="text"
          defaultValue={section.data.fullName}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="John Doe"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          type="email"
          defaultValue={section.data.email}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="john@example.com"
        />
      </div>
      <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 text-sm font-medium">
        Save Changes
      </button>
    </div>
  );
}

function ExperienceEditorContent({ section }: { section: any }) {
  return (
    <div className="space-y-4">
      {section.data.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">No work experience added yet</p>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 text-sm font-medium">
            + Add Experience
          </button>
        </div>
      ) : (
        <>
          {section.data.map((exp: any, idx: number) => (
            <div key={idx} className="p-4 border border-gray-200 rounded-lg">
              <h4 className="font-medium text-gray-900">{exp.jobTitle}</h4>
              <p className="text-sm text-gray-600">{exp.company}</p>
              <div className="flex justify-end gap-2 mt-3">
                <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                  Edit
                </button>
                <button className="text-sm text-red-600 hover:text-red-700 font-medium">
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-300 text-gray-600 hover:text-indigo-600 transition-colors duration-200 text-sm font-medium">
            + Add Another Experience
          </button>
        </>
      )}
    </div>
  );
}

export default SectionCard;
