"use client";
import { useState } from 'react';
import { useGlobalStore } from '@/store/useGlobalStore';
import { careerFields } from './resumeData';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export function CareerFieldStep() {
  const { resumeBuilder, setCareerField, populateWithDummyContent } = useGlobalStore();
  const [selectedField, setSelectedField] = useState(resumeBuilder.data.careerField);

  const handleFieldSelect = (fieldId: string) => {
    setSelectedField(fieldId);
    setCareerField(fieldId);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl font-bold text-gray-900">Choose Your Career Field</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Select your career field to get personalized resume templates and content suggestions 
            tailored to your industry.
          </p>
        </motion.div>
      </div>

      {/* Career Field Grid - 4 columns, smaller cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {careerFields.map((field, index) => {
          const isSelected = selectedField === field.id;
          const Icon = field.icon;
          
          return (
            <motion.button
              key={field.id}
              onClick={() => handleFieldSelect(field.id)}
              className={cn(
                "relative p-4 rounded-xl border-2 transition-all duration-300 text-center group hover:shadow-md",
                isSelected
                  ? "border-indigo-500 bg-indigo-50 shadow-md"
                  : "border-gray-200 bg-white hover:border-gray-300"
              )}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Selection Indicator */}
              {isSelected && (
                <motion.div
                  className="absolute top-2 right-2 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <Check className="w-3 h-3 text-white" />
                </motion.div>
              )}

              {/* Icon */}
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center mb-3 mx-auto transition-colors",
                isSelected
                  ? "bg-indigo-500 text-white"
                  : "bg-gray-100 text-gray-600 group-hover:bg-gray-200"
              )}>
                <Icon className="w-5 h-5" />
              </div>

              {/* Content */}
              <div className="space-y-2">
                <h3 className={cn(
                  "text-sm font-semibold transition-colors",
                  isSelected ? "text-indigo-900" : "text-gray-900"
                )}>
                  {field.name}
                </h3>
                <p className={cn(
                  "text-xs transition-colors",
                  isSelected ? "text-indigo-700" : "text-gray-600"
                )}>
                  {field.description}
                </p>
              </div>

              {/* Skills Preview - Simplified */}
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex flex-wrap gap-1 justify-center">
                  {field.skills.technical.slice(0, 2).map((skill, skillIndex) => (
                    <span
                      key={skillIndex}
                      className={cn(
                        "px-2 py-1 text-xs rounded-full transition-colors",
                        isSelected
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {skill}
                    </span>
                  ))}
                  {field.skills.technical.length > 2 && (
                    <span className="px-2 py-1 text-xs text-gray-500">
                      +{field.skills.technical.length - 2}
                    </span>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>



      {/* Help Text */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.8 }}
      >
        <p className="text-sm text-gray-500">
          Don't see your field? Choose "General / Other" for versatile templates that work across industries.
        </p>
      </motion.div>
    </div>
  );
}
