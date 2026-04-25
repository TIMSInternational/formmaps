"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import {
  Evaluator,
  EvaluatorGroup,
  DEFAULT_EVALUATOR_GROUPS,
  validateEvaluatorRequirements,
  generateInvitationToken
} from "@/services/evaluationService";
import { useEvaluationData } from "@/hooks/useEvaluationData";

interface EvaluatorManagementProps {
  sessionId: string;
  evaluators: Evaluator[];
  onEvaluatorsUpdated: (evaluators: Evaluator[]) => void;
  onSendInvitations: (evaluatorIds: string[]) => void;
  className?: string;
}

interface EvaluatorFormData {
  name: string;
  email: string;
  phone?: string;
  relationship: string;
  groupType: EvaluatorGroup['type'];
}

export default function EvaluatorManagement({
  sessionId,
  evaluators,
  onEvaluatorsUpdated,
  onSendInvitations,
  className = ""
}: EvaluatorManagementProps) {
  const { addEvaluatorsToSession, validateEvaluators } = useEvaluationData();
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<EvaluatorGroup['type']>('parent');
  const [formData, setFormData] = useState<EvaluatorFormData>({
    name: '',
    email: '',
    phone: '',
    relationship: '',
    groupType: 'parent'
  });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>([]);
  const { t } = useTranslation();

  useEffect(() => {
    // Validate evaluators whenever they change
    const validation = validateEvaluators(sessionId);
    setValidationErrors(validation.errors);
  }, [evaluators, sessionId, validateEvaluators]);

  const handleAddEvaluator = async () => {
    if (!formData.name || !formData.email || !formData.relationship) {
      alert(t('evaluation.evaluatorManagement.fillRequired'));
      return;
    }

    try {
      setLoading(true);
      
      const newEvaluator: Partial<Evaluator> = {
        ...formData,
        invitationToken: generateInvitationToken(),
        invitationSent: false,
        responseReceived: false,
        isActive: true
      };

      const addedEvaluators = await addEvaluatorsToSession(sessionId, [newEvaluator]);
      onEvaluatorsUpdated([...evaluators, ...addedEvaluators]);
      
      // Reset form
      setFormData({
        name: '',
        email: '',
        phone: '',
        relationship: '',
        groupType: selectedGroup
      });
      setShowAddForm(false);
    } catch (error) {
      alert(t('evaluation.evaluatorManagement.failedAdd'));
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveEvaluator = (evaluatorId: string) => {
    const updatedEvaluators = evaluators.filter(e => e.id !== evaluatorId);
    onEvaluatorsUpdated(updatedEvaluators);
  };

  const handleSendInvitations = () => {
    if (selectedEvaluators.length === 0) {
      alert(t('evaluation.evaluatorManagement.selectEvaluatorsMessage'));
      return;
    }
    
    onSendInvitations(selectedEvaluators);
    setSelectedEvaluators([]);
  };

  const getGroupEvaluators = (groupType: EvaluatorGroup['type']) => {
    return evaluators.filter(e => e.groupType === groupType);
  };

  const getGroupRequirements = (groupType: EvaluatorGroup['type']) => {
    return DEFAULT_EVALUATOR_GROUPS.find(g => g.type === groupType);
  };

  const getGroupStatus = (groupType: EvaluatorGroup['type']) => {
    const group = getGroupRequirements(groupType);
    const groupEvaluators = getGroupEvaluators(groupType);
    
    if (!group) return { status: 'unknown', message: '' };
    
    const count = groupEvaluators.length;
    
    if (count < group.minRequired) {
      return {
        status: 'insufficient',
        message: t('evaluation.evaluatorManagement.needMore', { count: group.minRequired - count })
      };
    } else if (count > group.maxAllowed) {
      return {
        status: 'exceeded',
        message: t('evaluation.evaluatorManagement.overLimit', { count: count - group.maxAllowed })
      };
    } else {
      return {
        status: 'valid',
        message: t('evaluation.evaluatorManagement.countOfMax', { count, max: group.maxAllowed })
      };
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'insufficient': return 'text-red-600 bg-red-50 border-red-200';
      case 'exceeded': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'valid': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getRelationshipPlaceholder = (groupType: EvaluatorGroup['type']) => {
    switch (groupType) {
      case 'parent': return t('evaluation.evaluatorManagement.relationships.parent');
      case 'teacher': return t('evaluation.evaluatorManagement.relationships.teacher');
      case 'sibling_friend': return t('evaluation.evaluatorManagement.relationships.siblingFriend');
      case 'self': return t('evaluation.evaluatorManagement.relationships.self');
      default: return t('evaluation.evaluatorManagement.relationships.default');
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('evaluation.evaluatorManagement.title')}</h3>
          <p className="text-sm text-gray-600">{t('evaluation.evaluatorManagement.description')}</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          {t('evaluation.evaluatorManagement.addEvaluator')}
        </button>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center mb-2">
            <svg className="w-5 h-5 text-red-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <h4 className="text-sm font-medium text-red-800">Evaluator Requirements Not Met</h4>
          </div>
          <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Evaluator Groups */}
      <div className="space-y-6">
        {DEFAULT_EVALUATOR_GROUPS.map((group) => {
          const groupEvaluators = getGroupEvaluators(group.type);
          const status = getGroupStatus(group.type);
          
          return (
            <div key={group.id} className="border border-gray-200 rounded-lg p-4">
              {/* Group Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <h4 className="text-md font-medium text-gray-900 mr-3">{group.name}</h4>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(status.status)}`}>
                    {status.message}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setSelectedGroup(group.type);
                    setFormData(prev => ({ ...prev, groupType: group.type }));
                    setShowAddForm(true);
                  }}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Add {group.name.slice(0, -1)}
                </button>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">{group.description}</p>
              
              {/* Evaluators List */}
              {groupEvaluators.length > 0 ? (
                <div className="space-y-2">
                  {groupEvaluators.map((evaluator) => (
                    <div key={evaluator.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedEvaluators.includes(evaluator.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEvaluators(prev => [...prev, evaluator.id]);
                            } else {
                              setSelectedEvaluators(prev => prev.filter(id => id !== evaluator.id));
                            }
                          }}
                          className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <div>
                          <div className="font-medium text-gray-900">{evaluator.name}</div>
                          <div className="text-sm text-gray-600">
                            {evaluator.relationship} • {evaluator.email}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {/* Status Indicators */}
                        {evaluator.responseReceived ? (
                          <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                            Responded
                          </span>
                        ) : evaluator.invitationSent ? (
                          <span className="px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-full">
                            Invited
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full">
                            Pending
                          </span>
                        )}
                        
                        <button
                          onClick={() => handleRemoveEvaluator(evaluator.id)}
                          className="text-red-600 hover:text-red-700 p-1"
                          title="Remove evaluator"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No evaluators added yet
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bulk Actions */}
      {selectedEvaluators.length > 0 && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">
              {selectedEvaluators.length} evaluator(s) selected
            </span>
            <div className="space-x-2">
              <button
                onClick={() => setSelectedEvaluators([])}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Clear Selection
              </button>
              <button
                onClick={handleSendInvitations}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Send Invitations
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Evaluator Modal */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={() => setShowAddForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Add Evaluator</h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Group Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Evaluator Group *
                  </label>
                  <select
                    value={formData.groupType}
                    onChange={(e) => setFormData(prev => ({ ...prev, groupType: e.target.value as EvaluatorGroup['type'] }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {DEFAULT_EVALUATOR_GROUPS.map((group) => (
                      <option key={group.id} value={group.type}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter full name"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter email address"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter phone number"
                  />
                </div>

                {/* Relationship */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Relationship *
                  </label>
                  <input
                    type="text"
                    value={formData.relationship}
                    onChange={(e) => setFormData(prev => ({ ...prev, relationship: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={getRelationshipPlaceholder(formData.groupType)}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEvaluator}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Adding...' : 'Add Evaluator'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}