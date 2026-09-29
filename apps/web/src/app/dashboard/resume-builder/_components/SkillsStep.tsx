"use client";
import { useState } from 'react';
import { useGlobalStore } from '@/store/useGlobalStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface SkillForm {
  name: string;
  category: 'technical' | 'soft' | 'language';
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

const initialSkillForm: SkillForm = {
  name: '',
  category: 'technical',
  level: 'intermediate'
};

export function SkillsStep() {
  const { t } = useTranslation();
  // Values are stored on the skill; only the labels are translated.
  const skillCategories = [
    { value: 'technical', label: t("resumeBuilder.skillsStep.categories.technical", "Technical Skills") },
    { value: 'soft', label: t("resumeBuilder.skillsStep.categories.soft", "Soft Skills") },
    { value: 'language', label: t("resumeBuilder.skillsStep.categories.language", "Languages") }
  ];

  const skillLevels = [
    { value: 'beginner', label: t("resumeBuilder.skillsStep.levels.beginner", "Beginner") },
    { value: 'intermediate', label: t("resumeBuilder.skillsStep.levels.intermediate", "Intermediate") },
    { value: 'advanced', label: t("resumeBuilder.skillsStep.levels.advanced", "Advanced") },
    { value: 'expert', label: t("resumeBuilder.skillsStep.levels.expert", "Expert") }
  ];
  const { resumeBuilder, addSkill, removeSkill } = useGlobalStore();
  const { skills } = resumeBuilder.data;
  
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<SkillForm>(initialSkillForm);

  const handleInputChange = (field: keyof SkillForm, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (formData.name.trim()) {
      addSkill(formData);
      setFormData(initialSkillForm);
      setIsAdding(false);
    }
  };

  const handleCancel = () => {
    setFormData(initialSkillForm);
    setIsAdding(false);
  };

  const groupedSkills = skills.reduce((acc, skill) => {
    if (!acc[skill.category]) {
      acc[skill.category] = [];
    }
    acc[skill.category].push(skill);
    return acc;
  }, {} as Record<string, typeof skills>);

  const getLevelColor = (level: string) => {
    const colors = {
      beginner: 'bg-gray-200 text-gray-700',
      intermediate: 'bg-blue-200 text-blue-700',
      advanced: 'bg-green-200 text-green-700',
      expert: 'bg-purple-200 text-purple-700'
    };
    return colors[level as keyof typeof colors] || colors.intermediate;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">{t("resumeBuilder.skillsStep.title", "Skills")}</h2>
        <p className="text-sm text-gray-600">
          {t("resumeBuilder.skillsStep.subtitle", "Add your technical skills, soft skills, and languages. Be specific and honest about your skill levels.")}
        </p>
      </div>

      {/* Existing Skills by Category */}
      {Object.entries(groupedSkills).map(([category, categorySkills]) => (
        <div key={category} className="space-y-3">
          <h3 className="font-medium text-gray-900">
            {skillCategories.find(cat => cat.value === category)?.label || category}
          </h3>
          <div className="flex flex-wrap gap-2">
            {categorySkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center space-x-2 bg-gray-50 rounded-lg p-2 border"
              >
                <span className="text-sm font-medium text-gray-900">{skill.name}</span>
                <span className={cn(
                  "text-xs px-2 py-1 rounded-full",
                  getLevelColor(skill.level)
                )}>
                  {skillLevels.find((l) => l.value === skill.level)?.label || skill.level}
                </span>
                <button
                  onClick={() => {
                    // Add a small delay to prevent rapid state changes that might cause PDF rendering issues
                    setTimeout(() => removeSkill(skill.id), 10);
                  }}
                  aria-label={t("resumeBuilder.skillsStep.removeSkill", "Remove {{name}}", { name: skill.name })}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Add Skill Form */}
      {isAdding ? (
        <div className="border border-gray-200 rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-gray-900">{t("resumeBuilder.skillsStep.addNewSkill", "Add New Skill")}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="skillName">{t("resumeBuilder.skillsStep.skillName", "Skill Name *")}</Label>
              <Input
                id="skillName"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder={t("resumeBuilder.skillsStep.skillNamePlaceholder", "JavaScript, Leadership, Spanish...")}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">{t("resumeBuilder.comparisonTable.category", "Category")}</Label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#2E9098]"
              >
                {skillCategories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="level">{t("resumeBuilder.skillsStep.skillLevel", "Skill Level")}</Label>
              <select
                id="level"
                value={formData.level}
                onChange={(e) => handleInputChange('level', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#2E9098]"
              >
                {skillLevels.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex space-x-2">
            <Button onClick={handleSubmit}>{t("resumeBuilder.skillsStep.addSkill", "Add Skill")}</Button>
            <Button variant="outline" onClick={handleCancel}>{t("common.cancel", "Cancel")}</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setIsAdding(true)} className="w-full">
          {t("resumeBuilder.skillsStep.addSkillPlus", "+ Add Skill")}
        </Button>
      )}

   
    </motion.div>
  );
}
