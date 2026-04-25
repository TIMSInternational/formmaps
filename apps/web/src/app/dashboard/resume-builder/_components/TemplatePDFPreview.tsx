"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, FileText } from 'lucide-react';

interface TemplatePDFPreviewProps {
  data: any;
  templateId: string;
  className?: string;
}

export function TemplatePDFPreview({ data, templateId, className = "" }: TemplatePDFPreviewProps) {
  const [pdfComponents, setPdfComponents] = useState<any>(null);
  const [isClient, setIsClient] = useState(false);
  const [loadingPDF, setLoadingPDF] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Lazy load PDF components
  useEffect(() => {
    if (!pdfComponents && isClient) {
      setLoadingPDF(true);
      
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
        setLoadingPDF(false);
      });
    }
  }, [pdfComponents, isClient]);

  // Create PDF document for template preview
  const renderPDFTemplate = useMemo(() => {
    if (!pdfComponents) return null;

    try {
      const { Document, Page, Text, View, StyleSheet } = pdfComponents;
      
      // Get template-specific styles
      const getTemplateStyles = (template: string) => {
        const baseStyles = {
          page: {
            flexDirection: 'column',
            backgroundColor: '#FFFFFF',
            padding: '0.5in', // Smaller padding for preview
            fontSize: 9, // Smaller font for preview
            fontFamily: 'Helvetica',
            lineHeight: 1.1,
          },
          header: {
            textAlign: 'center',
            marginBottom: 8,
            paddingBottom: 4,
          },
          name: {
            fontSize: 12, // Smaller for preview
            fontWeight: 'bold',
            marginBottom: 3,
            color: '#000000',
            textTransform: 'uppercase',
          },
          contact: {
            fontSize: 8,
            color: '#000000',
            marginBottom: 1,
            lineHeight: 1.1,
          },
          sectionTitle: {
            fontSize: 10,
            fontWeight: 'bold',
            marginTop: 8,
            marginBottom: 4,
            color: '#000000',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            borderBottom: '1pt solid #000000',
            paddingBottom: 2,
          },
          text: {
            fontSize: 8,
            lineHeight: 1.2,
            marginBottom: 2,
            color: '#000000',
          },
          bulletPoint: {
            fontSize: 8,
            marginBottom: 1,
            marginLeft: 12,
            color: '#000000',
            lineHeight: 1.2,
          },
          experienceHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 2,
            alignItems: 'flex-start',
          },
          jobTitle: {
            fontSize: 9,
            fontWeight: 'bold',
            color: '#000000',
            marginBottom: 1,
          },
          company: {
            fontSize: 8,
            color: '#000000',
            marginBottom: 1,
          },
          date: {
            fontSize: 8,
            color: '#000000',
            textAlign: 'right',
            fontWeight: 'normal',
          },
          location: {
            fontSize: 8,
            color: '#000000',
            textAlign: 'right',
            marginTop: 1,
          },
        };

        // Customize styles based on template
        switch (template) {
          case 'modern':
            return {
              ...baseStyles,
              name: { ...baseStyles.name, color: '#2563eb' },
              sectionTitle: { ...baseStyles.sectionTitle, color: '#2563eb', borderBottom: '1pt solid #2563eb' },
            };
          case 'creative':
            return {
              ...baseStyles,
              name: { ...baseStyles.name, color: '#7c3aed' },
              sectionTitle: { ...baseStyles.sectionTitle, color: '#7c3aed', borderBottom: '1pt solid #7c3aed' },
              header: { ...baseStyles.header, textAlign: 'left' },
            };
          case 'minimal':
            return {
              ...baseStyles,
              sectionTitle: { ...baseStyles.sectionTitle, borderBottom: 'none', borderLeft: '2pt solid #000000', paddingLeft: 6 },
            };
          case 'executive':
            return {
              ...baseStyles,
              name: { ...baseStyles.name, fontSize: 14, color: '#1f2937' },
              sectionTitle: { ...baseStyles.sectionTitle, color: '#1f2937', fontSize: 10 },
            };
          case 'tech':
            return {
              ...baseStyles,
              name: { ...baseStyles.name, color: '#059669' },
              sectionTitle: { ...baseStyles.sectionTitle, color: '#059669', borderBottom: '1pt solid #059669' },
            };
          default:
            return baseStyles;
        }
      };
    
      const styles = StyleSheet.create(getTemplateStyles(templateId));

      // Use sample data for preview
      const sampleData = {
        personalInfo: {
          fullName: data.personalInfo?.fullName || 'John Doe',
          email: data.personalInfo?.email || 'john.doe@email.com',
          phone: data.personalInfo?.phone || '(555) 123-4567',
          location: data.personalInfo?.location || 'City, State',
          summary: data.personalInfo?.summary || 'Professional summary highlighting key skills and experience.'
        },
        experience: data.experience?.length > 0 ? data.experience.slice(0, 2) : [
          {
            jobTitle: 'Software Engineer',
            company: 'Tech Company',
            startDate: '2022',
            endDate: 'Present',
            location: 'City, State',
            description: ['Key achievement or responsibility']
          }
        ],
        education: data.education?.length > 0 ? data.education.slice(0, 1) : [
          {
            degree: 'Bachelor of Science',
            institution: 'University Name',
            graduationDate: '2022',
            location: 'City, State'
          }
        ]
      };

      return (
        <Document>
          <Page size="A4" style={styles.page}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.name}>
                {sampleData.personalInfo.fullName}
              </Text>
              <Text style={styles.contact}>
                {sampleData.personalInfo.phone} | {sampleData.personalInfo.email}
              </Text>
              <Text style={styles.contact}>
                {sampleData.personalInfo.location}
              </Text>
            </View>

            {/* Summary */}
            <View>
              <Text style={styles.sectionTitle}>Summary</Text>
              <Text style={styles.text}>{sampleData.personalInfo.summary}</Text>
            </View>

            {/* Experience */}
            <View>
              <Text style={styles.sectionTitle}>Experience</Text>
              {sampleData.experience.map((exp: any, index: number) => (
                <View key={index} style={{ marginBottom: 6 }}>
                  <View style={styles.experienceHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.jobTitle}>{exp.jobTitle}</Text>
                      <Text style={styles.company}>{exp.company}</Text>
                    </View>
                    <View>
                      <Text style={styles.date}>
                        {exp.startDate} - {exp.endDate}
                      </Text>
                      <Text style={styles.location}>{exp.location}</Text>
                    </View>
                  </View>
                  {exp.description && exp.description.map((desc: string, descIndex: number) => (
                    <Text key={descIndex} style={styles.bulletPoint}>
                      • {desc}
                    </Text>
                  ))}
                </View>
              ))}
            </View>

            {/* Education */}
            <View>
              <Text style={styles.sectionTitle}>Education</Text>
              {sampleData.education.map((edu: any, index: number) => (
                <View key={index} style={{ marginBottom: 4 }}>
                  <View style={styles.experienceHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.jobTitle}>{edu.degree}</Text>
                      <Text style={styles.company}>{edu.institution}</Text>
                    </View>
                    <View>
                      <Text style={styles.date}>{edu.graduationDate}</Text>
                      <Text style={styles.location}>{edu.location}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </Page>
        </Document>
      );
    } catch (error) {
      console.error('Error rendering PDF template:', error);
      return null;
    }
  }, [pdfComponents, data, templateId]);

  if (!isClient) {
    return null;
  }

  return (
    <div className={`w-full h-full ${className}`}>
      {loadingPDF ? (
        <div className="flex items-center justify-center h-full bg-gray-50">
          <div className="text-center">
            <Loader2 size={24} className="animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-xs text-gray-600">Loading PDF preview...</p>
          </div>
        </div>
      ) : pdfComponents && renderPDFTemplate ? (
        <div className="w-full h-full">
          <pdfComponents.PDFViewer
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: '#f9fafb'
            }}
            showToolbar={false}
          >
            {renderPDFTemplate}
          </pdfComponents.PDFViewer>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full bg-gray-50">
          <div className="text-center">
            <FileText size={24} className="text-gray-400 mx-auto mb-2" />
            <p className="text-xs text-gray-600">PDF preview unavailable</p>
          </div>
        </div>
      )}
    </div>
  );
}
