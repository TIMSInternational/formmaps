"use client";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { Linkedin, Globe, Github, Twitter, FolderOpen } from "lucide-react";

// Register fonts for better typography
Font.register({
  family: "Inter",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZhrib2Bg-4.woff2",
    },
    {
      src: "https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fMZhrib2Bg-4.woff2",
      fontWeight: "bold",
    },
  ],
});

// Minimal template styles - clean and simple
const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 40,
    fontFamily: "Inter",
    fontSize: 10,
    lineHeight: 1.5,
    color: "#374151",
  },
  header: {
    marginBottom: 30,
    textAlign: "center",
  },
  name: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 8,
  },
  contactInfo: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 15,
    marginBottom: 15,
  },
  contactItem: {
    fontSize: 10,
    color: "#6b7280",
  },
  divider: {
    width: 60,
    height: 1,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginBottom: 20,
  },
  summary: {
    marginBottom: 30,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  summaryText: {
    fontSize: 11,
    color: "#4b5563",
    lineHeight: 1.6,
    fontStyle: "italic",
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 15,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  experienceItem: {
    marginBottom: 20,
    textAlign: "center",
  },
  jobTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  company: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 4,
  },
  jobDetails: {
    fontSize: 10,
    color: "#9ca3af",
    marginBottom: 8,
  },
  descriptionContainer: {
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 10,
    color: "#4b5563",
    lineHeight: 1.4,
    marginBottom: 3,
    textAlign: "left",
  },
  educationItem: {
    marginBottom: 15,
    textAlign: "center",
  },
  degree: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 2,
  },
  institution: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 2,
  },
  graduationDate: {
    fontSize: 10,
    color: "#9ca3af",
  },
  skillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  skillItem: {
    fontSize: 10,
    color: "#4b5563",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderStyle: "solid",
    borderRadius: 15,
  },
  twoColumnLayout: {
    flexDirection: "row",
    gap: 40,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    flex: 1,
  },
  centerDivider: {
    width: 1,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 20,
  },
});

interface ResumeData {
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    website: string;
    github?: string;
    twitter?: string;
    portfolio?: string;
    professionalTitle?: string;
    dateOfBirth?: string;
    nationality?: string;
    summary: string;
    careerObjective?: string;
    languages?: string;
    maritalStatus?: string;
    driversLicense?: string;
    militaryService?: string;
    visaStatus?: string;
    preferredPronouns?: string;
    [key: string]: any; // Support for custom fields
  };
  experience: Array<{
    id: string;
    jobTitle: string;
    company: string;
    location: string;
    startDate: string;
    endDate: string;
    current: boolean;
    description: string[];
  }>;
  education: Array<{
    id: string;
    degree: string;
    institution: string;
    location: string;
    graduationDate: string;
    gpa?: string;
  }>;
  skills: Array<{
    id: string;
    name: string;
    category: string;
    level: string;
  }>;
  customFields?: Array<{
    id: string;
    name: string;
    value: string;
    type: string;
    enabled: boolean;
  }>;
  dynamicSections?: Array<{
    id: string;
    type: string;
    title: string;
    entries: Array<{
      id: string;
      [key: string]: any;
    }>;
  }>;
}

interface MinimalTemplatePDFProps {
  data: ResumeData;
}

export function MinimalTemplatePDF({ data }: MinimalTemplatePDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{data.personalInfo.fullName}</Text>
          {data.personalInfo.professionalTitle && (
            <Text
              style={[
                styles.contactItem,
                { fontSize: 12, fontStyle: "italic", marginBottom: 4 },
              ]}
            >
              {data.personalInfo.professionalTitle}
            </Text>
          )}
          <View style={styles.contactInfo}>
            <Text style={styles.contactItem}>{data.personalInfo.email}</Text>
            <Text style={styles.contactItem}>•</Text>
            <Text style={styles.contactItem}>{data.personalInfo.phone}</Text>
            <Text style={styles.contactItem}>•</Text>
            <Text style={styles.contactItem}>{data.personalInfo.location}</Text>
          </View>

          {/* Social Links */}
          {(data.personalInfo.linkedin ||
            data.personalInfo.website ||
            data.personalInfo.github ||
            data.personalInfo.twitter ||
            data.personalInfo.portfolio) && (
            <View style={styles.contactInfo}>
              {data.personalInfo.linkedin && (
                <Text style={styles.contactItem}>
                  🔗 {data.personalInfo.linkedin}
                </Text>
              )}
              {data.personalInfo.website && (
                <>
                  {data.personalInfo.linkedin && (
                    <Text style={styles.contactItem}>•</Text>
                  )}
                  <Text style={styles.contactItem}>
                    🌐 {data.personalInfo.website}
                  </Text>
                </>
              )}
              {data.personalInfo.portfolio && (
                <>
                  {(data.personalInfo.linkedin ||
                    data.personalInfo.website) && (
                    <Text style={styles.contactItem}>•</Text>
                  )}
                  <Text style={styles.contactItem}>
                    📁 {data.personalInfo.portfolio}
                  </Text>
                </>
              )}
              {data.personalInfo.github && (
                <>
                  {(data.personalInfo.linkedin ||
                    data.personalInfo.website ||
                    data.personalInfo.portfolio) && (
                    <Text style={styles.contactItem}>•</Text>
                  )}
                  <Text style={styles.contactItem}>
                    💻 {data.personalInfo.github}
                  </Text>
                </>
              )}
              {data.personalInfo.twitter && (
                <>
                  {(data.personalInfo.linkedin ||
                    data.personalInfo.website ||
                    data.personalInfo.portfolio ||
                    data.personalInfo.github) && (
                    <Text style={styles.contactItem}>•</Text>
                  )}
                  <Text style={styles.contactItem}>
                    🐦 {data.personalInfo.twitter}
                  </Text>
                </>
              )}
            </View>
          )}

          {/* Additional Personal Info */}
          {(data.personalInfo.nationality || data.personalInfo.dateOfBirth) && (
            <View style={styles.contactInfo}>
              {data.personalInfo.nationality && (
                <Text style={[styles.contactItem, { fontSize: 9 }]}>
                  Nationality: {data.personalInfo.nationality}
                </Text>
              )}
              {data.personalInfo.dateOfBirth && (
                <>
                  {data.personalInfo.nationality && (
                    <Text style={[styles.contactItem, { fontSize: 9 }]}>•</Text>
                  )}
                  <Text style={[styles.contactItem, { fontSize: 9 }]}>
                    DOB: {data.personalInfo.dateOfBirth}
                  </Text>
                </>
              )}
            </View>
          )}

          <View style={styles.divider} />
        </View>

        {/* Summary */}
        {data.personalInfo.summary && (
          <View style={styles.summary}>
            <Text style={styles.summaryText}>{data.personalInfo.summary}</Text>
          </View>
        )}

        {/* Career Objective */}
        {(data.personalInfo as any).careerObjective && (
          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              {(data.personalInfo as any).careerObjective}
            </Text>
          </View>
        )}

        {/* Languages */}
        {(data.personalInfo as any).languages && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Languages</Text>
            <Text style={styles.description}>
              {(data.personalInfo as any).languages}
            </Text>
          </View>
        )}

        {/* Professional Experience */}
        {data.experience.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            {data.experience.map((exp) => (
              <View key={exp.id} style={styles.experienceItem}>
                <Text style={styles.jobTitle}>{exp.jobTitle}</Text>
                <Text style={styles.company}>{exp.company}</Text>
                <Text style={styles.jobDetails}>
                  {exp.startDate} - {exp.current ? "Present" : exp.endDate} •{" "}
                  {exp.location}
                </Text>
                <View style={styles.descriptionContainer}>
                  {exp.description.map((desc, index) => (
                    <Text key={index} style={styles.description}>
                      • {desc}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.twoColumnLayout}>
          {/* Left Column - Education */}
          <View style={styles.leftColumn}>
            {data.education.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Education</Text>
                {data.education.map((edu) => (
                  <View key={edu.id} style={styles.educationItem}>
                    <Text style={styles.degree}>{edu.degree}</Text>
                    <Text style={styles.institution}>
                      {edu.institution}, {edu.location}
                    </Text>
                    <Text style={styles.graduationDate}>
                      {edu.graduationDate}
                      {edu.gpa && ` • GPA: ${edu.gpa}`}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.centerDivider} />

          {/* Right Column - Skills */}
          <View style={styles.rightColumn}>
            {data.skills.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Skills</Text>
                <View style={styles.skillsContainer}>
                  {data.skills.map((skill) => (
                    <Text key={skill.id} style={styles.skillItem}>
                      {skill.name}
                    </Text>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Custom Fields */}
        {data.customFields &&
          data.customFields.filter((f) => f.enabled && f.value).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Additional Information</Text>
              {data.customFields
                .filter((f) => f.enabled && f.value)
                .map((field) => (
                  <View key={field.id} style={{ marginBottom: 5 }}>
                    <Text style={styles.description}>
                      <Text style={{ fontWeight: "bold" }}>{field.name}: </Text>
                      {field.value}
                    </Text>
                  </View>
                ))}
            </View>
          )}

        {/* Dynamic Sections */}
        {data.dynamicSections &&
          data.dynamicSections.map((section) => (
            <View key={section.id} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.entries.map((entry) => (
                <View key={entry.id} style={{ marginBottom: 8 }}>
                  {section.type === "projects" && (
                    <>
                      <Text style={styles.degree}>
                        {entry.title || entry.name}
                      </Text>
                      {entry.technologies && (
                        <Text style={styles.institution}>
                          Technologies: {entry.technologies}
                        </Text>
                      )}
                      {entry.description && (
                        <Text style={styles.description}>
                          {entry.description}
                        </Text>
                      )}
                      {entry.link && (
                        <Text style={[styles.description, { fontSize: 9 }]}>
                          Link: {entry.link}
                        </Text>
                      )}
                    </>
                  )}
                  {section.type === "certificates" && (
                    <>
                      <Text style={styles.degree}>
                        {entry.name || entry.title}
                      </Text>
                      {entry.issuer && (
                        <Text style={styles.institution}>
                          Issued by: {entry.issuer}
                        </Text>
                      )}
                      {entry.date && (
                        <Text style={styles.graduationDate}>{entry.date}</Text>
                      )}
                    </>
                  )}
                  {section.type === "languages" && (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text style={styles.description}>
                        {entry.language || entry.name}
                      </Text>
                      {entry.proficiency && (
                        <Text style={styles.description}>
                          {entry.proficiency}
                        </Text>
                      )}
                    </View>
                  )}
                  {section.type === "publications" && (
                    <>
                      <Text style={styles.degree}>
                        {entry.title || entry.name}
                      </Text>
                      {entry.authors && (
                        <Text style={styles.institution}>
                          Authors: {entry.authors}
                        </Text>
                      )}
                      {entry.publisher && (
                        <Text style={styles.institution}>
                          Publisher: {entry.publisher}
                        </Text>
                      )}
                      {entry.description && (
                        <Text style={styles.description}>
                          {entry.description}
                        </Text>
                      )}
                      {entry.link && (
                        <Text style={[styles.description, { fontSize: 9 }]}>
                          Link: {entry.link}
                        </Text>
                      )}
                      {entry.date && (
                        <Text style={styles.graduationDate}>{entry.date}</Text>
                      )}
                    </>
                  )}
                  {section.type !== "projects" &&
                    section.type !== "certificates" &&
                    section.type !== "languages" &&
                    section.type !== "publications" && (
                      <>
                        <Text style={styles.degree}>
                          {entry.title || entry.name}
                        </Text>
                        {entry.description && (
                          <Text style={styles.description}>
                            {entry.description}
                          </Text>
                        )}
                        {entry.date && (
                          <Text style={styles.graduationDate}>
                            {entry.date}
                          </Text>
                        )}
                      </>
                    )}
                </View>
              ))}
            </View>
          ))}
      </Page>
    </Document>
  );
}

// Preview component for the template selector
export function MinimalTemplatePreview({ data }: MinimalTemplatePDFProps) {
  return (
    <div className="w-full h-full bg-white p-8 text-xs overflow-hidden">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {data.personalInfo.fullName}
        </h1>
        {data.personalInfo.professionalTitle && (
          <p className="text-gray-600 text-sm italic mb-2">
            {data.personalInfo.professionalTitle}
          </p>
        )}
        <div className="flex flex-wrap justify-center items-center gap-2 text-gray-600 text-xs mb-2">
          <span>{data.personalInfo.email}</span>
          <span>•</span>
          <span>{data.personalInfo.phone}</span>
          <span>•</span>
          <span>{data.personalInfo.location}</span>
        </div>

        {/* Social Links */}
        {(data.personalInfo.linkedin ||
          data.personalInfo.website ||
          data.personalInfo.github ||
          data.personalInfo.twitter ||
          data.personalInfo.portfolio) && (
          <div className="flex flex-wrap justify-center items-center gap-3 text-gray-600 text-xs mb-2">
            {data.personalInfo.linkedin && (
              <div className="flex items-center gap-1">
                <Linkedin size={12} />
                <span>{data.personalInfo.linkedin}</span>
              </div>
            )}
            {data.personalInfo.website && (
              <div className="flex items-center gap-1">
                <Globe size={12} />
                <span>{data.personalInfo.website}</span>
              </div>
            )}
            {data.personalInfo.portfolio && (
              <div className="flex items-center gap-1">
                <FolderOpen size={12} />
                <span>{data.personalInfo.portfolio}</span>
              </div>
            )}
            {data.personalInfo.github && (
              <div className="flex items-center gap-1">
                <Github size={12} />
                <span>{data.personalInfo.github}</span>
              </div>
            )}
            {data.personalInfo.twitter && (
              <div className="flex items-center gap-1">
                <Twitter size={12} />
                <span>{data.personalInfo.twitter}</span>
              </div>
            )}
          </div>
        )}

        {/* Additional Personal Info */}
        {(data.personalInfo.nationality || data.personalInfo.dateOfBirth) && (
          <div className="flex justify-center items-center gap-2 text-gray-600 text-xs mb-2">
            {data.personalInfo.nationality && (
              <span>Nationality: {data.personalInfo.nationality}</span>
            )}
            {data.personalInfo.dateOfBirth && (
              <>
                {data.personalInfo.nationality && <span>•</span>}
                <span>DOB: {data.personalInfo.dateOfBirth}</span>
              </>
            )}
          </div>
        )}

        <div className="w-12 h-px bg-gray-300 mx-auto mb-4"></div>
      </div>

      {/* Summary */}
      {data.personalInfo.summary && (
        <div className="text-center mb-6 px-8">
          <p className="text-gray-600 text-xs leading-relaxed italic">
            {data.personalInfo.summary.substring(0, 150)}...
          </p>
        </div>
      )}

      {/* Experience */}
      {data.experience.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-900 text-center mb-4 uppercase tracking-widest">
            Experience
          </h2>
          {data.experience.slice(0, 2).map((exp) => (
            <div key={exp.id} className="mb-4 text-center">
              <h3 className="font-bold text-gray-900 text-xs mb-1">
                {exp.jobTitle}
              </h3>
              <p className="text-gray-600 text-xs mb-1">{exp.company}</p>
              <p className="text-gray-400 text-xs mb-2">
                {exp.startDate} - {exp.current ? "Present" : exp.endDate} •{" "}
                {exp.location}
              </p>
              <div className="px-4 text-left">
                {exp.description.slice(0, 2).map((desc, index) => (
                  <p key={index} className="text-xs text-gray-600 mb-1">
                    • {desc.substring(0, 60)}...
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Education & Skills */}
      <div className="grid grid-cols-2 gap-6">
        {/* Education */}
        <div>
          <h2 className="text-sm font-bold text-gray-900 text-center mb-3 uppercase tracking-widest">
            Education
          </h2>
          {data.education.slice(0, 1).map((edu) => (
            <div key={edu.id} className="text-center">
              <h3 className="font-bold text-gray-900 text-xs mb-1">
                {edu.degree}
              </h3>
              <p className="text-gray-600 text-xs mb-1">
                {edu.institution}, {edu.location}
              </p>
              <p className="text-gray-400 text-xs">{edu.graduationDate}</p>
            </div>
          ))}
        </div>

        {/* Skills */}
        <div>
          <h2 className="text-sm font-bold text-gray-900 text-center mb-3 uppercase tracking-widest">
            Skills
          </h2>
          <div className="flex flex-wrap justify-center gap-1">
            {data.skills.slice(0, 8).map((skill) => (
              <span
                key={skill.id}
                className="text-xs text-gray-600 border border-gray-300 px-2 py-1 rounded-full"
              >
                {skill.name}
              </span>
            ))}
          </div>
        </div>

        {/* Custom Fields */}
        {data.customFields &&
          data.customFields.filter((f) => f.enabled && f.value).length > 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-bold text-gray-900 text-center mb-3 uppercase tracking-widest">
                Additional Information
              </h2>
              {data.customFields
                .filter((f) => f.enabled && f.value)
                .slice(0, 3)
                .map((field) => (
                  <p key={field.id} className="text-xs text-gray-700 mb-1">
                    <strong>{field.name}:</strong> {field.value}
                  </p>
                ))}
            </div>
          )}

        {/* Dynamic Sections */}
        {data.dynamicSections &&
          data.dynamicSections.slice(0, 2).map((section) => (
            <div key={section.id} className="mb-4">
              <h2 className="text-sm font-bold text-gray-900 text-center mb-3 uppercase tracking-widest">
                {section.title}
              </h2>
              {section.entries.slice(0, 2).map((entry) => (
                <div key={entry.id} className="mb-3 text-center">
                  {section.type === "projects" && (
                    <>
                      <h3 className="font-bold text-gray-900 text-xs mb-1">
                        {entry.title || entry.name}
                      </h3>
                      {entry.technologies && (
                        <p className="text-gray-600 text-xs">
                          {entry.technologies}
                        </p>
                      )}
                    </>
                  )}
                  {section.type === "certificates" && (
                    <>
                      <h3 className="font-bold text-gray-900 text-xs mb-1">
                        {entry.name || entry.title}
                      </h3>
                      {entry.issuer && (
                        <p className="text-gray-600 text-xs">{entry.issuer}</p>
                      )}
                    </>
                  )}
                  {section.type === "languages" && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-700">
                        {entry.language || entry.name}
                      </span>
                      {entry.proficiency && (
                        <span className="text-xs text-gray-600">
                          {entry.proficiency}
                        </span>
                      )}
                    </div>
                  )}
                  {section.type === "publications" && (
                    <>
                      <h3 className="font-bold text-gray-900 text-xs mb-1">
                        {entry.title || entry.name}
                      </h3>
                      {entry.authors && (
                        <p className="text-gray-600 text-xs">
                          Authors: {entry.authors}
                        </p>
                      )}
                      {entry.publisher && (
                        <p className="text-gray-600 text-xs">
                          Publisher: {entry.publisher}
                        </p>
                      )}
                      {entry.description && (
                        <p className="text-gray-700 text-xs">
                          {entry.description.substring(0, 60)}...
                        </p>
                      )}
                    </>
                  )}
                  {section.type !== "projects" &&
                    section.type !== "certificates" &&
                    section.type !== "languages" &&
                    section.type !== "publications" && (
                      <h3 className="font-bold text-gray-900 text-xs mb-1">
                        {entry.title || entry.name}
                      </h3>
                    )}
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
