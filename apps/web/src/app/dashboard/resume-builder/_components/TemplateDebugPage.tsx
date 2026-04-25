"use client";
import React, { useState } from 'react';
import { useGlobalStore } from '@/store/useGlobalStore';
import { ArrowLeft, RefreshCw, Eye } from 'lucide-react';
import { TemplatePreviewCard } from './TemplatePreviewCard';
import { motion } from 'motion/react';

// Optimized sample data for single-page layout comparison
const debugSampleData = {
  personalInfo: {
    fullName: 'Alexandra Johnson',
    email: 'alexandra.johnson@email.com',
    phone: '(555) 123-4567',
    location: 'San Francisco, CA',
    linkedin: 'linkedin.com/in/alexandra-johnson',
    website: 'alexandra-portfolio.com',
    summary: 'Results-driven professional with 8+ years of experience in project management and strategic planning. Proven track record of leading cross-functional teams and delivering projects ahead of schedule.'
  },
  experience: [
    {
      jobTitle: 'Senior Project Manager',
      company: 'TechCorp Solutions',
      startDate: '2021',
      endDate: 'Present',
      location: 'San Francisco, CA',
      current: true,
      description: [
        'Led 15+ cross-functional projects with budgets exceeding $2M, achieving 98% on-time delivery rate',
        'Implemented Agile methodologies reducing project cycle time by 30% and improving team productivity',
        'Managed stakeholder relationships across 5 departments, facilitating seamless communication'
      ]
    },
    {
      jobTitle: 'Project Coordinator',
      company: 'Innovation Labs Inc.',
      startDate: '2019',
      endDate: '2021',
      location: 'San Francisco, CA',
      current: false,
      description: [
        'Coordinated 8 concurrent projects with teams of 10-15 members, maintaining 95% client satisfaction rate',
        'Created comprehensive project documentation and reporting systems, improving transparency by 40%',
        'Managed project budgets totaling $800K annually, consistently delivering under budget by 5-10%'
      ]
    }
  ],
  education: [
    {
      degree: 'Master of Business Administration (MBA)',
      institution: 'Stanford University',
      graduationDate: '2017',
      location: 'Stanford, CA',
      gpa: '3.8/4.0'
    }
  ],
  skills: [
    { id: '1', name: 'Project Management' },
    { id: '2', name: 'Agile/Scrum' },
    { id: '3', name: 'Stakeholder Management' },
    { id: '4', name: 'Budget Planning' },
    { id: '5', name: 'Data Analysis' },
    { id: '6', name: 'Strategic Planning' },
    { id: '7', name: 'Team Leadership' },
    { id: '8', name: 'Process Improvement' }
  ],
  template: 'modern' // Will be overridden for each template
};

const templates = [
  { id: 'modern', name: 'Modern', description: 'Clean professional layout with blue accents' },
  { id: 'creative', name: 'Creative', description: 'Two-column sidebar layout with purple theme' },
  { id: 'minimal', name: 'Minimal', description: 'Clean minimal design with left borders' },
  { id: 'executive', name: 'Executive', description: 'Distinguished executive styling with sophistication' },
  { id: 'tech', name: 'Tech', description: 'Tech-focused layout with green accents and skill tags' }
];

interface TemplateDebugPageProps {
  onClose?: () => void;
}

export function TemplateDebugPage({ onClose }: TemplateDebugPageProps) {
  const { resumeBuilder } = useGlobalStore();
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleTemplateClick = (templateId: string) => {
    setSelectedTemplate(selectedTemplate === templateId ? null : templateId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {onClose && (
              <button
                onClick={onClose}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft size={20} />
                <span>Back to Resume Builder</span>
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Template Debug Comparison</h1>
              <p className="text-sm text-gray-600">Compare all 5 resume templates with identical sample data</p>
              <p className="text-xs text-gray-500 mt-1">
                Direct URL: <code className="bg-gray-100 px-1 rounded">/dashboard/resume-builder/debug</code>
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefresh}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <RefreshCw size={16} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Template Grid */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {templates.map((template) => (
            <motion.div
              key={`${template.id}-${refreshKey}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-lg shadow-lg overflow-hidden"
            >
              {/* Template Header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                    <p className="text-sm text-gray-600">{template.description}</p>
                  </div>
                  <button
                    onClick={() => handleTemplateClick(template.id)}
                    className="flex items-center space-x-1 px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors text-sm"
                  >
                    <Eye size={14} />
                    <span>Focus</span>
                  </button>
                </div>
              </div>

              {/* Template Preview */}
              <div className="p-4">
                <div className="aspect-[8.5/11] bg-gray-50 relative overflow-hidden rounded-lg h-[400px] border border-gray-200">
                  <TemplatePreviewCard
                    data={{
                      ...debugSampleData,
                      template: template.id
                    }}
                    templateId={template.id}
                    className="w-full h-full"
                  />
                </div>
              </div>

              {/* Template Info */}
              <div className="px-4 pb-4">
                <div className="text-xs text-gray-500 space-y-1">
                  <div>Template ID: <span className="font-mono">{template.id}</span></div>
                  <div>Sample Data: Alexandra Johnson Profile</div>
                  <div>Render: PDF Preview Component</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Focused Template Modal */}
      {selectedTemplate && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-8"
          onClick={() => setSelectedTemplate(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {templates.find(t => t.id === selectedTemplate)?.name} Template
                  </h2>
                  <p className="text-sm text-gray-600">
                    {templates.find(t => t.id === selectedTemplate)?.description}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className="aspect-[8.5/11] bg-gray-50 relative overflow-hidden rounded-lg h-[600px] border border-gray-200">
                <TemplatePreviewCard
                  data={{
                    ...debugSampleData,
                    template: selectedTemplate
                  }}
                  templateId={selectedTemplate}
                  className="w-full h-full"
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
