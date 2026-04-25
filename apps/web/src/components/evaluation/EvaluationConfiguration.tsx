'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  CompetencyDimension, 
  RatingScale, 
  EvaluationConfiguration,
  EvaluatorGroup,
  EvaluatorRequirement,
  createDefaultConfiguration
} from '@/services/evaluationService';

interface EvaluationConfigurationProps {
  initialConfig?: EvaluationConfiguration;
  onSave: (config: EvaluationConfiguration) => Promise<void>;
  onCancel?: () => void;
  className?: string;
}

interface CompetencyFormData {
  id: string;
  name: string;
  description: string;
  category: 'interests' | 'talents' | 'strengths' | 'emotional_intelligence' | 'leadership' | 'responsibility' | 'communication';
  weight: number;
}

interface RatingOptionFormData {
  value: number;
  label: string;
  description: string;
}

const EvaluationConfigurationComponent: React.FC<EvaluationConfigurationProps> = ({
  initialConfig,
  onSave,
  onCancel,
  className = ''
}) => {
  const [config, setConfig] = useState<EvaluationConfiguration>(
    initialConfig || {
      id: '',
      name: 'Default Configuration',
      description: '',
      competencyDimensions: [],
      ratingScale: {
        id: 'default-scale',
        name: '5-Point Scale',
        description: 'Standard 5-point rating scale',
        type: 'likert',
        minValue: 1,
        maxValue: 5,
        labels: [
          { value: 1, label: 'Poor', description: 'Needs significant improvement' },
          { value: 2, label: 'Fair', description: 'Below expectations' },
          { value: 3, label: 'Good', description: 'Meets expectations' },
          { value: 4, label: 'Very Good', description: 'Exceeds expectations' },
          { value: 5, label: 'Excellent', description: 'Outstanding performance' }
        ],
        options: [
          { value: 1, label: 'Poor', description: 'Needs significant improvement' },
          { value: 2, label: 'Fair', description: 'Below expectations' },
          { value: 3, label: 'Good', description: 'Meets expectations' },
          { value: 4, label: 'Very Good', description: 'Exceeds expectations' },
          { value: 5, label: 'Excellent', description: 'Outstanding performance' }
        ]
      },
      evaluatorRequirements: {
        self: { minimum: 1, maximum: 1 },
        parent: { minimum: 1, maximum: 2 },
        teacher: { minimum: 1, maximum: 3 },
        peer: { minimum: 1, maximum: 3 }
      },
      evaluatorGroups: [],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  );
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'competencies' | 'rating' | 'requirements'>('competencies');
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Form states
  const [competencyForm, setCompetencyForm] = useState<CompetencyFormData>({
    id: '',
    name: '',
    description: '',
    category: 'interests',
    weight: 1
  });
  const [ratingForm, setRatingForm] = useState<RatingOptionFormData>({
    value: 1,
    label: '',
    description: ''
  });

  const competencyCategories = [
    'interests',
    'talents',
    'strengths',
    'emotional_intelligence',
    'leadership',
    'responsibility',
    'communication'
  ];

  const validateConfiguration = (): boolean => {
    const errors: string[] = [];

    // Validate competencies
    if (config.competencyDimensions.length === 0) {
      errors.push('At least one competency dimension is required');
    }

    // Validate rating scale
    if (config.ratingScale.options.length < 2) {
      errors.push('Rating scale must have at least 2 options');
    }

    // Validate evaluator groups
    const totalRequired = config.evaluatorGroups.reduce((sum, group: EvaluatorGroup) => sum + group.minRequired, 0);
    if (totalRequired === 0) {
      errors.push('At least one evaluator is required');
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSave = async () => {
    if (!validateConfiguration()) return;

    setIsSaving(true);
    try {
      await onSave(config);
    } catch (error) {
      console.error('Error saving configuration:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const addCompetency = () => {
    if (!competencyForm.name || !competencyForm.category) return;

    const newCompetency: CompetencyDimension = {
      id: competencyForm.id || `comp_${Date.now()}`,
      name: competencyForm.name,
      description: competencyForm.description,
      category: competencyForm.category,
      weight: competencyForm.weight,
      isActive: true,
      order: config.competencyDimensions.length + 1
    };

    setConfig(prev => ({
      ...prev,
      competencyDimensions: [...prev.competencyDimensions, newCompetency]
    }));

    // Reset form
    setCompetencyForm({
      id: '',
      name: '',
      description: '',
      category: 'interests',
      weight: 1
    });
  };

  const updateCompetency = (id: string, updates: Partial<CompetencyDimension>) => {
    setConfig(prev => ({
      ...prev,
      competencyDimensions: prev.competencyDimensions.map(comp =>
        comp.id === id ? { ...comp, ...updates } : comp
      )
    }));
  };

  const removeCompetency = (id: string) => {
    setConfig(prev => ({
      ...prev,
      competencyDimensions: prev.competencyDimensions.filter(comp => comp.id !== id)
    }));
  };

  const addRatingOption = () => {
    if (!ratingForm.label) return;

    const newOption = {
      value: ratingForm.value,
      label: ratingForm.label,
      description: ratingForm.description
    };

    setConfig(prev => ({
      ...prev,
      ratingScale: {
        ...prev.ratingScale,
        options: [...prev.ratingScale.options, newOption].sort((a, b) => a.value - b.value)
      }
    }));

    // Reset form
    setRatingForm({
      value: Math.max(...config.ratingScale.options.map(o => o.value)) + 1,
      label: '',
      description: ''
    });
  };

  const removeRatingOption = (value: number) => {
    setConfig(prev => ({
      ...prev,
      ratingScale: {
        ...prev.ratingScale,
        options: prev.ratingScale.options.filter(opt => opt.value !== value)
      }
    }));
  };

  const updateEvaluatorRequirement = (group: keyof EvaluatorRequirement, field: 'minimum' | 'maximum', value: number) => {
    setConfig(prev => ({
      ...prev,
      evaluatorRequirements: {
        ...prev.evaluatorRequirements,
        [group]: {
          ...prev.evaluatorRequirements[group],
          [field]: value
        }
      }
    }));
  };

  const resetToDefaults = () => {
    setConfig(createDefaultConfiguration());
  };

  return (
    <div className={`max-w-6xl mx-auto p-6 ${className}`}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          360° Evaluation Configuration
        </h1>
        <p className="text-gray-600">
          Configure competency dimensions, rating scales, and evaluator requirements for your assessment.
        </p>
      </div>

      {/* Validation Errors */}
      <AnimatePresence>
        {validationErrors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6"
          >
            <h3 className="text-red-800 font-medium mb-2">Configuration Issues:</h3>
            <ul className="text-red-700 text-sm space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index}>• {error}</li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="flex space-x-8">
          {[
            { id: 'competencies', label: 'Competency Dimensions', count: config.competencyDimensions.length },
            { id: 'rating', label: 'Rating Scale', count: config.ratingScale.options.length },
            { id: 'requirements', label: 'Evaluator Requirements', count: Object.keys(config.evaluatorRequirements).length }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              <span className="ml-2 bg-gray-100 text-gray-600 py-1 px-2 rounded-full text-xs">
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* Competencies Tab */}
        {activeTab === 'competencies' && (
          <motion.div
            key="competencies"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            {/* Add Competency Form */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">{t('evaluation.config.addCompetencyTitle')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('evaluation.config.nameLabel')}</label>
                  <input
                    type="text"
                    value={competencyForm.name}
                    onChange={(e) => setCompetencyForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t('evaluation.config.namePlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('evaluation.config.categoryLabel')}</label>
                  <select
                    value={competencyForm.category}
                    onChange={(e) => setCompetencyForm(prev => ({ ...prev, category: e.target.value as CompetencyFormData['category'] }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">{t('evaluation.config.selectCategoryPlaceholder')}</option>
                    {competencyCategories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('evaluation.config.descriptionLabel')}</label>
                  <textarea
                    value={competencyForm.description}
                    onChange={(e) => setCompetencyForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder={t('evaluation.config.descriptionPlaceholder')}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('evaluation.config.weightLabel')}</label>
                  <input
                    type="number"
                    min="0.1"
                    max="5"
                    step="0.1"
                    value={competencyForm.weight}
                    onChange={(e) => setCompetencyForm(prev => ({ ...prev, weight: parseFloat(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={addCompetency}
                  disabled={!competencyForm.name || !competencyForm.category}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('evaluation.config.addCompetencyButton')}
                </button>
              </div>
            </div>

            {/* Existing Competencies */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Current Competencies</h3>
              {config.competencyDimensions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No competencies configured yet.</p>
              ) : (
                <div className="grid gap-4">
                  {config.competencyDimensions.map((competency) => (
                    <div key={competency.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{competency.name}</h4>
                          <p className="text-sm text-gray-600 mt-1">{competency.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span>Category: {competency.category}</span>
                            <span>Weight: {competency.weight}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => removeCompetency(competency.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Rating Scale Tab */}
        {activeTab === 'rating' && (
          <motion.div
            key="rating"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            {/* Rating Scale Info */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-lg font-medium text-blue-900 mb-2">{config.ratingScale.name}</h3>
              <p className="text-blue-700 text-sm">{config.ratingScale.description}</p>
            </div>

            {/* Add Rating Option */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">{t('evaluation.config.rating.addOptionTitle')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Value *</label>
                  <input
                    type="number"
                    min="1"
                    value={ratingForm.value}
                    onChange={(e) => setRatingForm(prev => ({ ...prev, value: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('evaluation.config.rating.label')}</label>
                  <input
                    type="text"
                    value={ratingForm.label}
                    onChange={(e) => setRatingForm(prev => ({ ...prev, label: e.target.value }))}
                    placeholder={t('evaluation.config.rating.labelPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('evaluation.config.rating.description')}</label>
                  <input
                    type="text"
                    value={ratingForm.description}
                    onChange={(e) => setRatingForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder={t('evaluation.config.rating.descriptionPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={addRatingOption}
                  disabled={!ratingForm.label}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('evaluation.config.rating.addOptionButton')}
                </button>
              </div>
            </div>

            {/* Current Rating Options */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Current Rating Scale</h3>
              <div className="grid gap-2">
                {config.ratingScale.options.map((option) => (
                  <div key={option.value} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">
                        {option.value}
                      </div>
                      <div>
                        <span className="font-medium text-gray-900">{option.label}</span>
                        {option.description && (
                          <p className="text-sm text-gray-600">{option.description}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeRatingOption(option.value)}
                      className="text-red-600 hover:text-red-800 p-1"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Requirements Tab */}
        {activeTab === 'requirements' && (
          <motion.div
            key="requirements"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="bg-yellow-50 rounded-lg p-4">
              <h3 className="text-yellow-800 font-medium mb-2">Evaluator Requirements</h3>
              <p className="text-yellow-700 text-sm">
                Set the minimum and maximum number of evaluators required for each group.
              </p>
            </div>

            <div className="grid gap-6">
              {Object.entries(config.evaluatorRequirements).map(([group, requirement]) => (
                <div key={group} className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 capitalize">
                    {group.replace(/([A-Z])/g, ' $1').trim()}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Minimum Required
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={requirement.minimum}
                        onChange={(e) => updateEvaluatorRequirement(
                          group as keyof EvaluatorRequirement,
                          'minimum',
                          parseInt(e.target.value) || 0
                        )}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Maximum Allowed
                      </label>
                      <input
                        type="number"
                        min={requirement.minimum}
                        max="20"
                        value={requirement.maximum}
                        onChange={(e) => updateEvaluatorRequirement(
                          group as keyof EvaluatorRequirement,
                          'maximum',
                          parseInt(e.target.value) || requirement.minimum
                        )}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
        <div className="flex gap-3">
          <button
            onClick={resetToDefaults}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Reset to Defaults
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
        
        <button
          onClick={handleSave}
          disabled={isSaving || validationErrors.length > 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
};

export default EvaluationConfigurationComponent;