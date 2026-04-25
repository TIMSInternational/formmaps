"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { useGlobalStore } from '@/store/useGlobalStore';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Loader2, FileText, X } from 'lucide-react';
import { LivePreviewPDF } from './LivePreviewPDF';
import { TemplateRenderer } from './TemplateRenderer';

// PDF Error Boundary Component for LivePreview
class PDFErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('PDF Error:', error, errorInfo);
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <X size={24} className="text-red-600" />
            </div>
            <h3 className="text-sm font-medium text-gray-900 mb-2">PDF Preview Error</h3>
            <p className="text-xs text-gray-600 mb-3">
              There was an issue rendering the PDF preview. Your data is safe.
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function LivePreview() {
  const { resumeBuilder } = useGlobalStore();
  const { data } = resumeBuilder;
  
  // Debounce the resume data to prevent excessive re-renders
  const debouncedData = useDebounce(data, 300); // 300ms delay
  const { personalInfo, experience, education, skills } = debouncedData;
  
  // Track if data is currently being debounced
  const isDataChanging = JSON.stringify(data) !== JSON.stringify(debouncedData);
  
  const [pdfComponents, setPdfComponents] = useState<any>(null);
  const [isClient, setIsClient] = useState(false);
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Lazy load PDF components on mount
  useEffect(() => {
    if (!pdfComponents && isClient) {
      setLoadingPDF(true);
      setPdfError(null);
      
      import('@react-pdf/renderer').then((reactPdf) => {
        setPdfComponents({
          PDFViewer: reactPdf.PDFViewer,
          Document: reactPdf.Document,
          Page: reactPdf.Page,
          Text: reactPdf.Text,
          View: reactPdf.View,
          StyleSheet: reactPdf.StyleSheet
        });
        setLoadingPDF(false);
      }).catch((error) => {
        console.error('Failed to load PDF components:', error);
        setPdfError('Failed to load PDF components. Please try again.');
        setLoadingPDF(false);
      });
    }
  }, [pdfComponents, isClient]);

  // Create PDF document based on selected template - memoized to prevent unnecessary re-renders
  const renderPDFTemplate = useMemo(() => {
    if (!pdfComponents) return null;

    try {
      // Use preview components for the selected template
      const templateComponents = {
        modern: () => import('./templates/ModernTemplate').then(m => m.ModernTemplatePDF),
        classic: () => import('./templates/ClassicTemplate').then(m => m.ClassicTemplatePDF),
        creative: () => import('./templates/CreativeTemplate').then(m => m.CreativeTemplatePDF),
        minimal: () => import('./templates/MinimalTemplate').then(m => m.MinimalTemplatePDF),
        executive: () => import('./templates/ExecutiveTemplate').then(m => m.ExecutiveTemplatePDF),
        tech: () => import('./templates/TechTemplate').then(m => m.TechTemplatePDF),
      };

      // For now, use a simple preview since dynamic imports in useMemo are complex
      // We'll create a simplified preview that matches the template style
      const { Document, Page, Text, View, StyleSheet } = pdfComponents;
    
    const styles = StyleSheet.create({
      page: {
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        padding: '0.75in', // ATS-friendly: 0.5-1 inch margins
        fontSize: 11,
        fontFamily: 'Helvetica', // ATS-friendly font
        lineHeight: 1.1, // Reduced from 1.15 for tighter spacing
      },
      header: {
        textAlign: 'center', // Back to center alignment for personal info
        marginBottom: 12, // Reduced from 16
        paddingBottom: 6, // Reduced from 8
      },
      name: {
        fontSize: 16, // ATS-friendly size (14-18pt)
        fontWeight: 'bold',
        marginBottom: 4, // Reduced from 6
        color: '#000000',
        textTransform: 'uppercase',
      },
      title: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 6, // Reduced from 8
        color: '#000000',
      },
      contact: {
        fontSize: 11, // Consistent with body text
        color: '#000000',
        marginBottom: 2, // Reduced from 3
        lineHeight: 1.1, // Reduced from 1.2
      },
      sectionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 12, // Reduced from 16
        marginBottom: 6, // Reduced from 8
        color: '#000000',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        borderBottom: '1pt solid #000000',
        paddingBottom: 3, // Reduced from 4
      },
      text: {
        fontSize: 11, // Standard body text size
        lineHeight: 1.2, // Reduced from 1.3
        marginBottom: 4, // Reduced from 6
        color: '#000000',
      },
      bulletPoint: {
        fontSize: 11,
        marginBottom: 2, // Reduced from 4
        marginLeft: 16, // Standard bullet indentation
        color: '#000000',
        lineHeight: 1.2, // Reduced from 1.3
      },
      experienceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 3, // Reduced from 4
        alignItems: 'flex-start',
      },
      jobTitle: {
        fontSize: 12, // Slightly larger for emphasis
        fontWeight: 'bold',
        color: '#000000',
        marginBottom: 1, // Reduced from 2
      },
      company: {
        fontSize: 11,
        color: '#000000',
        marginBottom: 1, // Reduced from 2
      },
      date: {
        fontSize: 11,
        color: '#000000',
        textAlign: 'right',
        fontWeight: 'normal',
      },
      location: {
        fontSize: 11,
        color: '#000000',
        textAlign: 'right',
        marginTop: 1,
      },
      skillsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8, // Reduced from 12
      },
      skill: {
        fontSize: 11,
        color: '#000000',
        marginRight: 14, // Reduced from 18
        marginBottom: 2, // Reduced from 4
      },
      educationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 3, // Reduced from 4
        alignItems: 'flex-start',
      },
      degree: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#000000',
        marginBottom: 1, // Reduced from 2
      },
      institution: {
        fontSize: 11,
        color: '#000000',
      },
    });

    return (
      <Document>
        <Page size="A4" style={styles.page}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.name}>
              {personalInfo.fullName || 'Your Name'}
            </Text>
            <Text style={styles.contact}>
              {personalInfo.phone && `${personalInfo.phone} | `}
              {personalInfo.email && `${personalInfo.email} | `}
              {personalInfo.location && personalInfo.location}
            </Text>
            {personalInfo.linkedin && (
              <Text style={styles.contact}>{personalInfo.linkedin}</Text>
            )}
          </View>

          {/* Summary */}
          {personalInfo.summary && (
            <View>
              <Text style={styles.sectionTitle}>Summary</Text>
              <Text style={styles.text}>{personalInfo.summary}</Text>
            </View>
          )}

          {/* Experience */}
          {experience.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>Experience</Text>
              {experience.map((exp, index) => (
                <View key={index} style={{ marginBottom: 8 }}>
                  <View style={styles.experienceHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.jobTitle}>{exp.jobTitle}</Text>
                      <Text style={styles.company}>{exp.company}</Text>
                    </View>
                    <View>
                      <Text style={styles.date}>
                        {exp.startDate} - {exp.current ? 'Present' : exp.endDate}
                      </Text>
                      <Text style={styles.location}>{exp.location}</Text>
                    </View>
                  </View>
                  {exp.description.map((desc, descIndex) => (
                    <Text key={descIndex} style={styles.bulletPoint}>
                      • {desc}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* Education */}
          {education.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>Education</Text>
              {education.map((edu, index) => (
                <View key={index} style={{ marginBottom: 6 }}>
                  <View style={styles.educationHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.degree}>{edu.degree}</Text>
                      <Text style={styles.institution}>{edu.institution}</Text>
                    </View>
                    <View>
                      <Text style={styles.date}>{edu.graduationDate}</Text>
                      <Text style={styles.location}>{edu.location}</Text>
                    </View>
                  </View>
                  {edu.gpa && (
                    <Text style={styles.text}>GPA: {edu.gpa}</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Skills */}
          {skills && skills.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>Skills</Text>
              <View style={styles.skillsContainer}>
                {skills.map((skill, index) => (
                  <Text key={skill.id || `skill-${index}`} style={styles.skill}>
                    {skill.name || ''}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </Page>
      </Document>
    );
    } catch (error) {
      console.error('Error rendering LivePreview PDF template:', error);
      return null;
    }
  }, [pdfComponents, personalInfo, experience, education, skills]); // Dependencies for memoization

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full h-full"
    >
      {/* Error Message */}
      {pdfError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm mb-4">
          {pdfError}
        </div>
      )}

      {/* Preview Content */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white relative">
        {loadingPDF ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <Loader2 size={48} className="animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading preview...</p>
            </div>
          </div>
        ) : (
          <div style={{ height: '480px' }} className="relative bg-gray-50">
            {/* Updating Loader Overlay */}
            {isDataChanging && (
              <motion.div
                className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="text-center">
                  <Loader2 size={32} className="animate-spin text-blue-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Updating preview...</p>
                </div>
              </motion.div>
            )}

            {/* Template Preview */}
            <motion.div
              className="w-full h-full"
              key={`template-${resumeBuilder.data.template}-${skills.length}-${experience.length}-${education.length}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <LivePreviewPDF
                className="w-full h-full shadow-sm"
              />
             
            </motion.div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
