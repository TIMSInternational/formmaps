"use client";
import { motion } from 'motion/react';
import { useGlobalStore } from '@/store/useGlobalStore';
import { SmartTemplateSelector } from './SmartTemplateSelector';

export function TemplateSelectionStep() {
  const { resumeBuilder } = useGlobalStore();
  const { careerField } = resumeBuilder.data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Choose Your Template</h2>
        <p className="text-sm text-gray-600">
          Select a professional template that best represents your style and career field.
          {careerField && " We've filtered templates that work well for your selected career field."}
        </p>
      </div>

      {/* Smart Template Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SmartTemplateSelector />
      </div>



   
    </motion.div>
  );
}
