"use client";
import React from 'react';
import { useGlobalStore } from '@/store/useGlobalStore';
import { motion, AnimatePresence } from 'motion/react';

// Import all template preview components
import { ModernTemplatePreview } from './templates/ModernTemplate';
import { ClassicTemplatePreview } from './templates/ClassicTemplate';
import { CreativeTemplatePreview } from './templates/CreativeTemplate';
import { MinimalTemplatePreview } from './templates/MinimalTemplate';
import { ExecutiveTemplatePreview } from './templates/ExecutiveTemplate';
import { TechTemplatePreview } from './templates/TechTemplate';

interface TemplateRendererProps {
  data?: any;
  templateId?: string;
  className?: string;
}

export function TemplateRenderer({ data, templateId, className = "" }: TemplateRendererProps) {
  const { resumeBuilder } = useGlobalStore();
  
  // Use provided data or fallback to store data
  const resumeData = data || resumeBuilder.data;
  const selectedTemplate = templateId || resumeData.template;

  // Render the appropriate template preview
  const renderTemplate = () => {
    switch (selectedTemplate) {
      case 'modern':
        return <ModernTemplatePreview data={resumeData} />;
      case 'classic':
        return <ClassicTemplatePreview data={resumeData} />;
      case 'creative':
        return <CreativeTemplatePreview data={resumeData} />;
      case 'minimal':
        return <MinimalTemplatePreview data={resumeData} />;
      case 'executive':
        return <ExecutiveTemplatePreview data={resumeData} />;
      case 'tech':
        return <TechTemplatePreview data={resumeData} />;
      default:
        return <ModernTemplatePreview data={resumeData} />;
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={selectedTemplate}
        className={`w-full h-full ${className}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.05 }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      >
        {renderTemplate()}
      </motion.div>
    </AnimatePresence>
  );
}
