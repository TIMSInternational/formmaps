"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, FileText } from 'lucide-react';

interface TemplatePreviewCardProps {
  data: any;
  templateId: string;
  className?: string;
}

export function TemplatePreviewCard({ data, templateId, className = "" }: TemplatePreviewCardProps) {
  const [pdfComponents, setPdfComponents] = useState<any>(null);
  const [isClient, setIsClient] = useState(false);
  const [loadingPDF, setLoadingPDF] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Lazy load PDF components - using PDFViewer like LivePreview
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

  // Create PDF document using PDFViewer like LivePreview
  const renderPDFTemplate = useMemo(() => {
    if (!pdfComponents) return null;

    try {
      const { Document, Page, Text, View, StyleSheet } = pdfComponents;
        
        // Get template-specific styles with diverse layouts
        const getTemplateStyles = (template: string) => {
          // Base styles for A4 paper (210 × 297 mm)
          const baseStyles = {
            page: {
              flexDirection: 'column',
              backgroundColor: '#FFFFFF',
              padding: '0.75in', // Standard padding like LivePreview
              fontSize: 11, // Standard font size like LivePreview
              fontFamily: 'Helvetica',
              lineHeight: 1.1,
              size: 'A4', // Ensure A4 paper size
            },
            // Common elements - improved spacing
            name: {
              fontSize: 16,
              fontWeight: 'bold',
              marginBottom: 6, // Increased spacing after name
              color: '#000000',
            },
            contact: {
              fontSize: 11,
              color: '#000000',
              marginBottom: 3, // Increased spacing between contact lines
              lineHeight: 1.2, // Better line height for readability
            },
            sectionTitle: {
              fontSize: 12,
              fontWeight: 'bold',
              marginTop: 16, // Increased top margin for better section separation
              marginBottom: 8, // Increased bottom margin for better spacing
              color: '#000000',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            },
            text: {
              fontSize: 11,
              lineHeight: 1.2,
              marginBottom: 4,
              color: '#000000',
            },
            bulletPoint: {
              fontSize: 11,
              marginBottom: 2,
              marginLeft: 16,
              color: '#000000',
              lineHeight: 1.2,
            },
            jobTitle: {
              fontSize: 12,
              fontWeight: 'bold',
              color: '#000000',
              marginBottom: 1,
            },
            company: {
              fontSize: 11,
              color: '#000000',
              marginBottom: 1,
            },
            date: {
              fontSize: 11,
              color: '#000000',
              fontWeight: 'normal',
            },
            skillItem: {
              fontSize: 11,
              color: '#000000',
              marginRight: 14,
              marginBottom: 2,
            },
          };

          // Create diverse template layouts
          switch (template) {
            case 'modern':
              // Clean, professional layout with blue accents - optimized for single page
              return {
                ...baseStyles,
                page: { ...baseStyles.page, flexDirection: 'column' },
                header: {
                  textAlign: 'center',
                  marginBottom: 14, // Reduced from 20 for better space utilization
                  paddingBottom: 8, // Reduced from 10
                  borderBottom: '2pt solid #2563eb',
                },
                name: { ...baseStyles.name, color: '#2563eb', textTransform: 'uppercase' },
                sectionTitle: {
                  ...baseStyles.sectionTitle,
                  color: '#2563eb',
                  borderBottom: '2pt solid #2563eb',
                  backgroundColor: '#eff6ff',
                  padding: 3, // Reduced from 4
                  marginTop: 10, // Reduced from 16
                  marginBottom: 6, // Reduced from 8
                },
                experienceHeader: {
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: 3, // Reduced from 4
                  alignItems: 'flex-start',
                },
              };

            case 'creative':
              // Two-column layout with sidebar - improved contrast and spacing
              return {
                ...baseStyles,
                page: { ...baseStyles.page, flexDirection: 'row' },
                sidebar: {
                  width: '35%',
                  backgroundColor: '#7c3aed',
                  padding: 12, // Reduced from 16
                  marginRight: 12, // Reduced from 16
                },
                mainContent: {
                  width: '65%',
                  padding: 6, // Reduced from 8
                },
                name: {
                  ...baseStyles.name,
                  color: '#ffffff',
                  fontSize: 16, // Reduced from 18 for better fit
                  marginBottom: 6, // Reduced from 8
                  lineHeight: 1.3, // Added proper line height to prevent overlap
                },
                contact: {
                  ...baseStyles.contact,
                  color: '#f3e8ff', // Improved contrast - lighter purple instead of #e9d5ff
                  marginBottom: 3, // Reduced from 4
                },
                text: {
                  ...baseStyles.text,
                  color: '#f8fafc', // Better contrast for sidebar text
                },
                textMain: {
                  ...baseStyles.text,
                  color: '#374151', // Dark text for main content area
                },
                sectionTitle: {
                  ...baseStyles.sectionTitle,
                  color: '#ffffff',
                  borderBottom: '2pt solid #ffffff',
                  marginTop: 10, // Reduced from 16
                  marginBottom: 6, // Reduced from 8
                },
                sectionTitleMain: {
                  ...baseStyles.sectionTitle,
                  color: '#7c3aed',
                  borderLeft: '4pt solid #7c3aed',
                  paddingLeft: 10, // Reduced from 12
                  borderBottom: 'none',
                  marginTop: 10, // Reduced from 16
                  marginBottom: 6, // Reduced from 8
                },
                experienceHeader: {
                  flexDirection: 'column',
                  marginBottom: 3, // Reduced from 4
                },
              };

            case 'minimal':
              // Clean minimal design with left borders - fixed overlap issue
              return {
                ...baseStyles,
                page: { ...baseStyles.page, flexDirection: 'column' },
                header: {
                  textAlign: 'left',
                  marginBottom: 16, // Reduced from 20
                  paddingBottom: 8, // Reduced from 10
                },
                name: { ...baseStyles.name, fontSize: 18, marginBottom: 6, textTransform: 'none' },
                sectionTitle: {
                  ...baseStyles.sectionTitle,
                  borderBottom: 'none',
                  borderLeft: '4pt solid #000000',
                  paddingLeft: 16, // Increased from 12 to prevent overlap with border
                  backgroundColor: '#f9fafb',
                  padding: 4,
                  // paddingLeft: 16, // Explicit left padding to ensure proper gap
                  marginTop: 12, // Reduced from 16
                  marginBottom: 6, // Reduced from 8
                },
                experienceHeader: {
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: 3,
                  alignItems: 'flex-start',
                },
              };

            case 'executive':
              // Distinguished executive layout with sophisticated styling
              return {
                ...baseStyles,
                page: { ...baseStyles.page, flexDirection: 'column' },
                header: {
                  textAlign: 'center',
                  marginBottom: 16, // Further reduced from 20
                  paddingBottom: 10, // Further reduced padding
                  borderBottom: '4pt solid #1f2937', // Thicker border for distinction
                  backgroundColor: '#f8fafc', // Subtle background
                  padding: 10, // Further reduced background padding
                },
                name: {
                  ...baseStyles.name,
                  fontSize: 20, // Reduced from 22 to prevent overlap
                  color: '#1f2937',
                  textTransform: 'none',
                  letterSpacing: 1.5, // Reduced letter spacing
                  fontWeight: 'bold',
                  marginBottom: 10, // Increased from 6 to prevent overlap with contact info
                  lineHeight: 1.2, // Added proper line height
                },
                contact: {
                  ...baseStyles.contact,
                  fontSize: 11, // Slightly smaller
                  color: '#4b5563', // Slightly muted contact info
                  marginBottom: 2, // Reduced margin
                  lineHeight: 1.3, // Better line height
                },
                sectionTitle: {
                  ...baseStyles.sectionTitle,
                  color: '#ffffff', // White text
                  backgroundColor: '#1f2937', // Dark background
                  fontSize: 12, // Slightly smaller
                  borderBottom: 'none',
                  textTransform: 'uppercase',
                  letterSpacing: 1.2, // Reduced letter spacing
                  padding: 3, // Further reduced padding
                  marginTop: 10, // Further reduced from 12
                  marginBottom: 4, // Further reduced from 6
                },
                jobTitle: {
                  ...baseStyles.jobTitle,
                  fontSize: 13, // Reduced from 14
                  color: '#1f2937',
                  fontWeight: 'bold',
                },
                jobTitleMain: {
                  ...baseStyles.jobTitle,
                  fontSize: 13,
                  color: '#1f2937', // Dark text for main content
                  fontWeight: 'bold',
                },
                company: {
                  ...baseStyles.company,
                  fontSize: 11, // Reduced from 12
                  color: '#4b5563',
                  fontStyle: 'italic', // Italicized company names
                },
                companyMain: {
                  ...baseStyles.company,
                  fontSize: 11,
                  color: '#4b5563', // Dark text for main content
                },
                text: {
                  ...baseStyles.text,
                  fontSize: 11, // Reduced from 12
                  lineHeight: 1.2, // Reduced line height
                  color: '#374151', // Ensure proper text color for Executive template
                },
                bulletPoint: {
                  ...baseStyles.bulletPoint,
                  fontSize: 11, // Reduced from 12
                  marginBottom: 2, // Reduced from 3
                  marginLeft: 16, // Reduced indentation
                },
                experienceHeader: {
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: 4, // Reduced from 6
                  alignItems: 'flex-start',
                  borderBottom: '1pt solid #e5e7eb', // Subtle separator
                  paddingBottom: 2, // Reduced from 3
                },
                date: {
                  ...baseStyles.date,
                  fontSize: 10, // Reduced from 11
                  color: '#6b7280',
                  fontWeight: 'bold',
                },
              };

            case 'tech':
              // Tech-focused layout with green accents and structured sections
              return {
                ...baseStyles,
                page: { ...baseStyles.page, flexDirection: 'column' },
                header: {
                  textAlign: 'left',
                  marginBottom: 20, // Increased spacing after header
                  paddingBottom: 12, // Increased padding
                  backgroundColor: '#f0fdf4',
                  padding: 12, // Increased overall padding
                },
                name: { ...baseStyles.name, color: '#059669', fontSize: 18 },
                contact: { ...baseStyles.contact, color: '#065f46' },
                sectionTitle: {
                  ...baseStyles.sectionTitle,
                  color: '#ffffff',
                  backgroundColor: '#059669',
                  padding: 4,
                  borderBottom: 'none',
                },
                experienceHeader: {
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: 3,
                  alignItems: 'flex-start',
                  backgroundColor: '#f0fdf4',
                  padding: 4,
                },
                skillsGrid: {
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                },
                skillTag: {
                  backgroundColor: '#dcfce7',
                  color: '#065f46',
                  padding: 2,
                  fontSize: 10,
                  borderRadius: 4,
                },
              };

            default:
              return {
                ...baseStyles,
                header: {
                  textAlign: 'center',
                  marginBottom: 8,
                  paddingBottom: 4,
                },
                sectionTitle: {
                  ...baseStyles.sectionTitle,
                  borderBottom: '1pt solid #000000',
                },
                experienceHeader: {
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: 2,
                  alignItems: 'flex-start',
                },
              };
          }
        };
      
        const styles = StyleSheet.create(getTemplateStyles(templateId));

        // Optimized sample data for single-page layout
        const sampleData = {
          personalInfo: {
            fullName: data.personalInfo?.fullName || 'Alexandra Johnson',
            email: data.personalInfo?.email || 'alexandra.johnson@email.com',
            phone: data.personalInfo?.phone || '(555) 123-4567',
            location: data.personalInfo?.location || 'San Francisco, CA',
            linkedin: data.personalInfo?.linkedin || 'linkedin.com/in/alexandra-johnson',
            website: data.personalInfo?.website || 'alexandra-portfolio.com',
            summary: data.personalInfo?.summary || 'Results-driven professional with 8+ years of experience in project management and strategic planning. Proven track record of leading cross-functional teams and delivering projects ahead of schedule.'
          },
          experience: data.experience?.length > 0 ? data.experience.slice(0, 2) : [
            {
              jobTitle: 'Senior Project Manager',
              company: 'TechCorp Solutions',
              startDate: '2021',
              endDate: 'Present',
              location: 'San Francisco, CA',
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
              description: [
                'Coordinated 8 concurrent projects with teams of 10-15 members, maintaining 95% client satisfaction rate',
                'Created comprehensive project documentation and reporting systems, improving transparency by 40%',
                'Managed project budgets totaling $800K annually, consistently delivering under budget by 5-10%'
              ]
            }
          ],
          education: data.education?.length > 0 ? data.education.slice(0, 1) : [
            {
              degree: 'Master of Business Administration (MBA)',
              institution: 'Stanford University',
              graduationDate: '2017',
              location: 'Stanford, CA',
              gpa: '3.8/4.0'
            }
          ],
          skills: data.skills?.length > 0 ? data.skills.slice(0, 8) : [
            { name: 'Project Management' },
            { name: 'Agile/Scrum' },
            { name: 'Stakeholder Management' },
            { name: 'Budget Planning' },
            { name: 'Data Analysis' },
            { name: 'Strategic Planning' },
            { name: 'Team Leadership' },
            { name: 'Process Improvement' }
          ],
          certifications: [
            'Project Management Professional (PMP)',
            'Certified ScrumMaster (CSM)'
          ],
          achievements: [
            'Led digital transformation project recognized with company Innovation Award 2023',
            'Mentored 12 junior project managers, with 100% promotion rate within 18 months'
          ]
        };

        // Create template-specific PDF layouts
        const renderTemplateLayout = () => {
          switch (templateId) {
            case 'creative':
              // Two-column layout with sidebar
              return (
                <Document>
                  <Page size="A4" style={styles.page}>
                    {/* Sidebar */}
                    <View style={styles.sidebar}>
                      <Text style={styles.name}>{sampleData.personalInfo.fullName}</Text>
                      <Text style={styles.contact}>{sampleData.personalInfo.phone}</Text>
                      <Text style={styles.contact}>{sampleData.personalInfo.email}</Text>
                      <Text style={styles.contact}>{sampleData.personalInfo.location}</Text>

                      <Text style={styles.sectionTitle}>Skills</Text>
                      {sampleData.skills.map((skill: any, index: number) => (
                        <Text key={index} style={styles.text}>• {skill.name}</Text>
                      ))}

                      <Text style={styles.sectionTitle}>Education</Text>
                      {sampleData.education.map((edu: any, index: number) => (
                        <View key={index} style={{ marginBottom: 3 }}>
                          <Text style={{...styles.text, fontWeight: 'bold'}}>{edu.degree}</Text>
                          <Text style={styles.text}>{edu.institution}</Text>
                          <Text style={styles.text}>{edu.graduationDate}</Text>
                        </View>
                      ))}

                      <Text style={styles.sectionTitle}>Certifications</Text>
                      {sampleData.certifications.map((cert: string, index: number) => (
                        <Text key={index} style={styles.text}>• {cert}</Text>
                      ))}
                    </View>

                    {/* Main Content */}
                    <View style={styles.mainContent}>
                      <Text style={styles.sectionTitleMain}>Professional Summary</Text>
                      <Text style={styles.textMain}>{sampleData.personalInfo.summary}</Text>

                      <Text style={styles.sectionTitleMain}>Professional Experience</Text>
                      {sampleData.experience.map((exp: any, index: number) => (
                        <View key={index} style={{ marginBottom: 4 }}>
                          <View style={styles.experienceHeader}>
                            <Text style={styles.jobTitleMain}>{exp.jobTitle}</Text>
                            <Text style={styles.companyMain}>{exp.company} | {exp.startDate} - {exp.endDate}</Text>
                          </View>
                          {exp.description && exp.description.slice(0, 3).map((desc: string, descIndex: number) => (
                            <Text key={descIndex} style={{...styles.bulletPoint, color: '#374151'}}>• {desc}</Text>
                          ))}
                        </View>
                      ))}

                      <Text style={styles.sectionTitleMain}>Key Achievements</Text>
                      {sampleData.achievements.map((achievement: string, index: number) => (
                        <Text key={index} style={{...styles.bulletPoint, color: '#374151'}}>• {achievement}</Text>
                      ))}
                    </View>
                  </Page>
                </Document>
              );

            default:
              // Standard single-column layout for other templates
              return (
                <Document>
                  <Page size="A4" style={styles.page}>
                    {/* Header */}
                    <View style={styles.header}>
                      <Text style={styles.name}>{sampleData.personalInfo.fullName}</Text>
                      <Text style={styles.contact}>
                        {sampleData.personalInfo.phone} | {sampleData.personalInfo.email} | {sampleData.personalInfo.location}
                      </Text>
                      {templateId === 'tech' && (
                        <Text style={styles.contact}>
                          {sampleData.personalInfo.linkedin} | {sampleData.personalInfo.website}
                        </Text>
                      )}
                    </View>

                    {/* Professional Summary */}
                    <View style={{ marginBottom: templateId === 'executive' ? 4 : 8 }}>
                      <Text style={styles.sectionTitle}>Professional Summary</Text>
                      <Text style={styles.text}>{sampleData.personalInfo.summary}</Text>
                    </View>

                    {/* Professional Experience */}
                    <View style={{ marginBottom: templateId === 'executive' ? 4 : 8 }}>
                      <Text style={styles.sectionTitle}>Professional Experience</Text>
                      {sampleData.experience.map((exp: any, index: number) => (
                        <View key={index} style={{ marginBottom: 4 }}>
                          <View style={styles.experienceHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.jobTitle}>{exp.jobTitle}</Text>
                              <Text style={styles.company}>{exp.company} | {exp.location}</Text>
                            </View>
                            <View>
                              <Text style={styles.date}>{exp.startDate} - {exp.endDate}</Text>
                            </View>
                          </View>
                          {exp.description && exp.description.slice(0, templateId === 'executive' ? 4 : 3).map((desc: string, descIndex: number) => (
                            <Text key={descIndex} style={styles.bulletPoint}>• {desc}</Text>
                          ))}
                        </View>
                      ))}
                    </View>

                    {/* Education */}
                    <View style={{ marginBottom: templateId === 'executive' ? 4 : 8 }}>
                      <Text style={styles.sectionTitle}>Education</Text>
                      {sampleData.education.map((edu: any, index: number) => (
                        <View key={index} style={{ marginBottom: templateId === 'executive' ? 2 : 4 }}>
                          <View style={styles.experienceHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.jobTitle}>{edu.degree}</Text>
                              <Text style={styles.company}>{edu.institution} | {edu.location}</Text>
                            </View>
                            <View>
                              <Text style={styles.date}>{edu.graduationDate}</Text>
                            </View>
                          </View>
                          {edu.gpa && <Text style={styles.text}>GPA: {edu.gpa}</Text>}
                        </View>
                      ))}
                    </View>

                    {/* Skills */}
                    <View style={{ marginBottom: templateId === 'executive' ? 4 : 8 }}>
                      <Text style={styles.sectionTitle}>Core Competencies</Text>
                      {templateId === 'tech' ? (
                        <View style={styles.skillsGrid}>
                          {sampleData.skills.map((skill: any, index: number) => (
                            <View key={index} style={styles.skillTag}>
                              <Text style={{ fontSize: 6, color: '#065f46' }}>{skill.name}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                          {sampleData.skills.map((skill: any, index: number) => (
                            <Text key={index} style={styles.skillItem}>{skill.name}</Text>
                          ))}
                        </View>
                      )}
                    </View>

                    {/* Certifications */}
                    <View style={{ marginBottom: templateId === 'executive' ? 4 : 8 }}>
                      <Text style={styles.sectionTitle}>Certifications</Text>
                      {sampleData.certifications.map((cert: string, index: number) => (
                        <Text key={index} style={styles.bulletPoint}>• {cert}</Text>
                      ))}
                    </View>

                    {/* Key Achievements */}
                    {templateId === 'executive' && (
                      <View style={{ marginBottom: 4 }}>
                        <Text style={styles.sectionTitle}>Key Achievements</Text>
                        {sampleData.achievements.map((achievement: string, index: number) => (
                          <Text key={index} style={styles.bulletPoint}>• {achievement}</Text>
                        ))}
                      </View>
                    )}
                  </Page>
                </Document>
              );
          }
        };

        return renderTemplateLayout();
      } catch (error) {
        console.error('Error rendering PDF template:', error);
        return null;
      }
    }, [pdfComponents, data, templateId]);

  if (!isClient) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-gray-100 ${className}`}>
        <div className="text-center">
          <FileText size={24} className="text-gray-400 mx-auto mb-2" />
          <p className="text-xs text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full ${className}`}>
      {loadingPDF ? (
        <div className="flex items-center justify-center h-full bg-gray-50">
          <div className="text-center">
            <Loader2 size={24} className="animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-xs text-gray-600">Loading preview...</p>
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
            <p className="text-xs text-gray-600">Preview unavailable</p>
          </div>
        </div>
      )}
    </div>
  );
}
