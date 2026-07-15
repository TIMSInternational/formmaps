"use client";
import { useState, useEffect } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { resumeTemplates, careerFields } from "./resumeData";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { TemplatePreviewCard } from "./TemplatePreviewCard";

interface SmartTemplateSelectorProps {
  onTemplateSelect?: (templateId: string) => void;
}

export function SmartTemplateSelector({
  onTemplateSelect,
}: SmartTemplateSelectorProps) {
  const { resumeBuilder, setResumeTemplate } = useGlobalStore();
  const { careerField, template: selectedTemplate } = resumeBuilder.data;

  // Get relevant templates based on career field
  const getRelevantTemplates = () => {
    if (!careerField) return resumeTemplates;

    const field = careerFields.find((f) => f.id === careerField);
    if (!field) return resumeTemplates;

    // Filter templates that are suitable for the selected career field
    const relevantTemplates = resumeTemplates.filter((template) =>
      template.suitableFor.includes(careerField)
    );

    // If no specific templates found, return all templates
    return relevantTemplates.length > 0 ? relevantTemplates : resumeTemplates;
  };

  const relevantTemplates = getRelevantTemplates();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isBrowsing, setIsBrowsing] = useState(false);

  // Initialize current index to show selected template, but allow independent browsing
  useEffect(() => {
    if (!isBrowsing && selectedTemplate) {
      const index = relevantTemplates.findIndex(
        (t) => t.id === selectedTemplate
      );
      if (index !== -1) {
        setCurrentIndex(index);
      }
    }
  }, [selectedTemplate, relevantTemplates, isBrowsing]);

  const handlePrevious = () => {
    setIsBrowsing(true);
    const newIndex =
      currentIndex === 0 ? relevantTemplates.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
    // Don't auto-select when browsing - let user explicitly click Select
  };

  const handleNext = () => {
    setIsBrowsing(true);
    const newIndex =
      currentIndex === relevantTemplates.length - 1 ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
    // Don't auto-select when browsing - let user explicitly click Select
  };

  const handleTemplateSelect = (templateId: string) => {
    const validTemplateId = templateId as
      | "modern"
      | "creative"
      | "minimal"
      | "executive"
      | "tech"
      | "classic";
    setResumeTemplate(validTemplateId);
    onTemplateSelect?.(templateId);
    setIsBrowsing(false); // Reset browsing state when template is selected

    // Trigger a smooth background transition
    const currentTemplate = relevantTemplates.find((t) => t.id === templateId);
    if (currentTemplate) {
      // Update CSS custom properties for smooth background transitions
      document.documentElement.style.setProperty(
        "--template-primary-color",
        currentTemplate.color
      );
    }
  };

  const currentTemplate = relevantTemplates[currentIndex];
  const selectedField = careerFields.find((f) => f.id === careerField);

  if (relevantTemplates.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No templates available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Career Field Context */}
      {selectedField && (
        <motion.div
          className="text-center space-y-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-center space-x-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <h3 className="text-lg font-semibold text-gray-900">
              Templates for {selectedField.name}
            </h3>
          </div>
          <p className="text-sm text-gray-600">
            Showing {relevantTemplates.length} template
            {relevantTemplates.length !== 1 ? "s" : ""}
            optimized for your career field
          </p>
        </motion.div>
      )}

      {/* Full-Width Template Display */}
      <div className="relative">
        {/* Navigation Buttons */}
        <button
          onClick={handlePrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 flex items-center justify-center hover:bg-white transition-all duration-200 hover:scale-105"
          disabled={relevantTemplates.length <= 1}
        >
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>

        <button
          onClick={handleNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 flex items-center justify-center hover:bg-white transition-all duration-200 hover:scale-105"
          disabled={relevantTemplates.length <= 1}
        >
          <ChevronRight className="w-6 h-6 text-gray-600" />
        </button>

        {/* Template Display */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTemplate.id}
            className={cn(
              "bg-white rounded-2xl border-2 overflow-hidden",
              selectedTemplate === currentTemplate.id
                ? "border-indigo-500 shadow-lg ring-2 ring-indigo-200"
                : "border-gray-200"
            )}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.3 }}
          >
            {/* Selected Template Badge */}
            {selectedTemplate === currentTemplate.id && (
              <div className="absolute top-4 right-4 z-20 bg-indigo-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                ✓ Currently Selected
              </div>
            )}

            {/* Centered Template Preview */}
            <div className="flex justify-center p-8">
              <div className="aspect-[8.5/11] bg-gray-50 relative overflow-hidden rounded-lg h-[500px] w-[400px] shadow-lg">
                <TemplatePreviewCard
                  data={resumeBuilder.data}
                  templateId={currentTemplate.id}
                  className="w-full h-full"
                />
              </div>
            </div>

            {/* Template Info */}
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xl font-bold text-gray-900">
                    {currentTemplate.name}
                  </h4>
                  <p className="text-gray-600">{currentTemplate.description}</p>
                </div>
                <button
                  onClick={() => handleTemplateSelect(currentTemplate.id)}
                  className={cn(
                    "px-6 py-3 rounded-xl font-medium transition-all duration-200",
                    selectedTemplate === currentTemplate.id
                      ? "bg-indigo-500 text-white shadow-lg"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  {selectedTemplate === currentTemplate.id
                    ? "Selected"
                    : "Select"}
                </button>
              </div>

              {/* Template Category */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-gray-500">
                  Category:
                </span>
                <span
                  className="px-2 py-1 text-xs rounded-full text-white font-medium"
                  style={{ backgroundColor: currentTemplate.color }}
                >
                  {currentTemplate.category}
                </span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Template Indicators */}
      {relevantTemplates.length > 1 && (
        <div className="flex justify-center space-x-2">
          {relevantTemplates.map((template, index) => (
            <button
              key={index}
              onClick={() => {
                setIsBrowsing(true);
                setCurrentIndex(index);
              }}
              className={cn(
                "w-3 h-3 rounded-full transition-all duration-200",
                index === currentIndex
                  ? "bg-indigo-500 scale-125"
                  : "bg-gray-300 hover:bg-gray-400"
              )}
              title={`View ${template.name} template`}
            />
          ))}
        </div>
      )}

      {/* Template Count */}
      <div className="text-center text-sm text-gray-500">
        Template {currentIndex + 1} of {relevantTemplates.length}
      </div>
    </div>
  );
}
