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
  family: "JetBrains",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/jetbrainsmono/v13/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff2",
    },
    {
      src: "https://fonts.gstatic.com/s/jetbrainsmono/v13/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff2",
      fontWeight: "bold",
    },
  ],
});

// Tech template styles - modern and technical
const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 32,
    fontFamily: "JetBrains",
    fontSize: 9,
    lineHeight: 1.4,
  },
  header: {
    marginBottom: 24,
    padding: 20,
    backgroundColor: "#0f172a",
    borderRadius: 8,
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 6,
  },
  title: {
    fontSize: 12,
    color: "#0ea5e9",
    marginBottom: 12,
    fontWeight: "bold",
  },
  contactInfo: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
  },
  contactItem: {
    fontSize: 9,
    color: "#cbd5e1",
    backgroundColor: "#1e293b",
    padding: "4 8",
    borderRadius: 4,
  },
  summary: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#f1f5f9",
    borderRadius: 6,
    borderLeftWidth: 4,
    borderLeftColor: "#0ea5e9",
    borderLeftStyle: "solid",
  },
  summaryText: {
    fontSize: 10,
    color: "#334155",
    lineHeight: 1.5,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 12,
    paddingBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: "#0ea5e9",
    borderBottomStyle: "solid",
  },
  experienceItem: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#0ea5e9",
    borderLeftStyle: "solid",
  },
  jobHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  jobTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#0f172a",
  },
  company: {
    fontSize: 10,
    color: "#0ea5e9",
    fontWeight: "bold",
    marginBottom: 4,
  },
  jobDetails: {
    fontSize: 9,
    color: "#64748b",
    backgroundColor: "#e2e8f0",
    padding: "2 6",
    borderRadius: 3,
  },
  description: {
    fontSize: 9,
    color: "#475569",
    lineHeight: 1.4,
    marginBottom: 2,
  },
  skillsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  skillCategory: {
    marginBottom: 12,
  },
  skillCategoryTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 6,
    backgroundColor: "#e2e8f0",
    padding: "4 8",
    borderRadius: 4,
  },
  skillItem: {
    fontSize: 9,
    color: "#ffffff",
    backgroundColor: "#0ea5e9",
    padding: "3 8",
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  educationItem: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#f1f5f9",
    borderRadius: 6,
  },
  degree: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 2,
  },
  institution: {
    fontSize: 10,
    color: "#0ea5e9",
    marginBottom: 2,
  },
  graduationDate: {
    fontSize: 9,
    color: "#64748b",
  },
  twoColumnLayout: {
    flexDirection: "row",
    gap: 20,
  },
  leftColumn: {
    flex: 2,
  },
  rightColumn: {
    flex: 1,
  },
  codeBlock: {
    fontFamily: "JetBrains",
    backgroundColor: "#1e293b",
    color: "#e2e8f0",
    padding: 8,
    borderRadius: 4,
    fontSize: 8,
    marginBottom: 8,
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

interface TechTemplatePDFProps {
  data: ResumeData;
}

export function TechTemplatePDF({ data }: TechTemplatePDFProps) {
  // Group skills by category
  const skillsByCategory = data.skills.reduce((acc, skill) => {
    if (!acc[skill.category]) {
      acc[skill.category] = [];
    }
    acc[skill.category].push(skill);
    return acc;
  }, {} as Record<string, typeof data.skills>);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{data.personalInfo.fullName}</Text>
          <Text style={styles.title}>
            {data.personalInfo.professionalTitle || "Software Engineer"}
          </Text>
          <View style={styles.contactInfo}>
            <Text style={styles.contactItem}>{data.personalInfo.email}</Text>
            <Text style={styles.contactItem}>{data.personalInfo.phone}</Text>
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
                <Text style={styles.contactItem}>
                  🌐 {data.personalInfo.website}
                </Text>
              )}
              {data.personalInfo.portfolio && (
                <Text style={styles.contactItem}>
                  📁 {data.personalInfo.portfolio}
                </Text>
              )}
              {data.personalInfo.github && (
                <Text style={styles.contactItem}>
                  💻 {data.personalInfo.github}
                </Text>
              )}
              {data.personalInfo.twitter && (
                <Text style={styles.contactItem}>
                  🐦 {data.personalInfo.twitter}
                </Text>
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
                <Text style={[styles.contactItem, { fontSize: 9 }]}>
                  DOB: {data.personalInfo.dateOfBirth}
                </Text>
              )}
            </View>
          )}
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

        <View style={styles.twoColumnLayout}>
          {/* Left Column */}
          <View style={styles.leftColumn}>
            {/* Professional Experience */}
            {data.experience.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Experience</Text>
                {data.experience.map((exp) => (
                  <View key={exp.id} style={styles.experienceItem}>
                    <View style={styles.jobHeader}>
                      <View>
                        <Text style={styles.jobTitle}>{exp.jobTitle}</Text>
                        <Text style={styles.company}>{exp.company}</Text>
                      </View>
                      <Text style={styles.jobDetails}>
                        {exp.startDate} -{" "}
                        {exp.current ? "Present" : exp.endDate}
                      </Text>
                    </View>
                    {exp.description.map((desc, index) => (
                      <Text key={index} style={styles.description}>
                        → {desc}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {/* Education */}
            {data.education.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Education</Text>
                {data.education.map((edu) => (
                  <View key={edu.id} style={styles.educationItem}>
                    <Text style={styles.degree}>{edu.degree}</Text>
                    <Text style={styles.institution}>{edu.institution}</Text>
                    <Text style={styles.graduationDate}>
                      {edu.graduationDate} • {edu.location}
                      {edu.gpa && ` • GPA: ${edu.gpa}`}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Right Column */}
          <View style={styles.rightColumn}>
            {/* Technical Skills */}
            {Object.keys(skillsByCategory).length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Skills</Text>
                {Object.entries(skillsByCategory).map(([category, skills]) => (
                  <View key={category} style={styles.skillCategory}>
                    <Text style={styles.skillCategoryTitle}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </Text>
                    <View style={styles.skillsGrid}>
                      {skills.map((skill) => (
                        <Text key={skill.id} style={styles.skillItem}>
                          {skill.name}
                        </Text>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Custom Fields */}
            {data.customFields &&
              data.customFields.filter((f) => f.enabled && f.value).length >
                0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    Additional Information
                  </Text>
                  {data.customFields
                    .filter((f) => f.enabled && f.value)
                    .map((field) => (
                      <Text key={field.id} style={styles.description}>
                        • {field.name}: {field.value}
                      </Text>
                    ))}
                </View>
              )}

            {/* Dynamic Sections */}
            {data.dynamicSections &&
              data.dynamicSections.map((section) => (
                <View key={section.id} style={styles.section}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  {section.entries.map((entry) => (
                    <View key={entry.id} style={{ marginBottom: 6 }}>
                      {section.type === "projects" && (
                        <>
                          <Text style={styles.jobTitle}>
                            {entry.title || entry.name}
                          </Text>
                          {entry.technologies && (
                            <Text style={styles.company}>
                              Technologies: {entry.technologies}
                            </Text>
                          )}
                          {entry.description && (
                            <Text style={styles.description}>
                              {entry.description}
                            </Text>
                          )}
                          {entry.link && (
                            <Text style={[styles.description, { fontSize: 8 }]}>
                              Link: {entry.link}
                            </Text>
                          )}
                        </>
                      )}
                      {section.type === "certificates" && (
                        <>
                          <Text style={styles.jobTitle}>
                            {entry.name || entry.title}
                          </Text>
                          {entry.issuer && (
                            <Text style={styles.company}>
                              Issued by: {entry.issuer}
                            </Text>
                          )}
                          {entry.date && (
                            <Text style={styles.graduationDate}>
                              {entry.date}
                            </Text>
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
                          <Text style={styles.jobTitle}>
                            {entry.title || entry.name}
                          </Text>
                          {entry.authors && (
                            <Text style={styles.company}>
                              Authors: {entry.authors}
                            </Text>
                          )}
                          {entry.publisher && (
                            <Text style={styles.company}>
                              Publisher: {entry.publisher}
                            </Text>
                          )}
                          {entry.description && (
                            <Text style={styles.description}>
                              {entry.description}
                            </Text>
                          )}
                          {entry.link && (
                            <Text style={[styles.description, { fontSize: 8 }]}>
                              Link: {entry.link}
                            </Text>
                          )}
                          {entry.date && (
                            <Text style={styles.graduationDate}>
                              {entry.date}
                            </Text>
                          )}
                        </>
                      )}
                      {section.type !== "projects" &&
                        section.type !== "certificates" &&
                        section.type !== "languages" &&
                        section.type !== "publications" && (
                          <>
                            <Text style={styles.jobTitle}>
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

            {/* Code Sample */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Code Sample</Text>
              <View style={styles.codeBlock}>
                <Text>const developer = {"{"};</Text>
                <Text> name: "{data.personalInfo.fullName}",</Text>
                <Text> skills: ["React", "Node.js"],</Text>
                <Text> passion: "Clean Code"</Text>
                <Text>{"};"}</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

// Preview component for the template selector
export function TechTemplatePreview({ data }: TechTemplatePDFProps) {
  return (
    <div className="w-full h-full bg-white p-6 text-xs overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 text-white p-4 rounded-lg mb-4">
        <h1 className="text-xl font-bold mb-1">{data.personalInfo.fullName}</h1>
        <p className="text-sky-400 font-bold text-sm mb-2">
          {data.personalInfo.professionalTitle || "Software Engineer"}
        </p>
        <div className="flex flex-wrap gap-2 text-xs mb-2">
          <span className="bg-slate-700 px-2 py-1 rounded">
            {data.personalInfo.email}
          </span>
          <span className="bg-slate-700 px-2 py-1 rounded">
            {data.personalInfo.phone}
          </span>
          <span className="bg-slate-700 px-2 py-1 rounded">
            {data.personalInfo.location}
          </span>
        </div>

        {/* Social Links */}
        {(data.personalInfo.linkedin ||
          data.personalInfo.website ||
          data.personalInfo.github ||
          data.personalInfo.twitter ||
          data.personalInfo.portfolio) && (
          <div className="flex flex-wrap gap-3 text-xs mb-2">
            {data.personalInfo.linkedin && (
              <div className="flex items-center gap-1 bg-slate-700 px-2 py-1 rounded text-xs">
                <Linkedin size={10} />
                <span>{data.personalInfo.linkedin}</span>
              </div>
            )}
            {data.personalInfo.website && (
              <div className="flex items-center gap-1 bg-slate-700 px-2 py-1 rounded text-xs">
                <Globe size={10} />
                <span>{data.personalInfo.website}</span>
              </div>
            )}
            {data.personalInfo.portfolio && (
              <div className="flex items-center gap-1 bg-slate-700 px-2 py-1 rounded text-xs">
                <FolderOpen size={10} />
                <span>{data.personalInfo.portfolio}</span>
              </div>
            )}
            {data.personalInfo.github && (
              <div className="flex items-center gap-1 bg-slate-700 px-2 py-1 rounded text-xs">
                <Github size={10} />
                <span>{data.personalInfo.github}</span>
              </div>
            )}
            {data.personalInfo.twitter && (
              <div className="flex items-center gap-1 bg-slate-700 px-2 py-1 rounded text-xs">
                <Twitter size={10} />
                <span>{data.personalInfo.twitter}</span>
              </div>
            )}
          </div>
        )}

        {/* Additional Personal Info */}
        {(data.personalInfo.nationality || data.personalInfo.dateOfBirth) && (
          <div className="flex gap-2 text-xs">
            {data.personalInfo.nationality && (
              <span className="bg-slate-700 px-2 py-1 rounded text-xs">
                {data.personalInfo.nationality}
              </span>
            )}
            {data.personalInfo.dateOfBirth && (
              <span className="bg-slate-700 px-2 py-1 rounded text-xs">
                DOB: {data.personalInfo.dateOfBirth}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      {data.personalInfo.summary && (
        <div className="bg-slate-50 border-l-4 border-sky-500 p-3 mb-4 rounded">
          <p className="text-slate-700 text-xs leading-relaxed">
            {data.personalInfo.summary.substring(0, 150)}...
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Experience */}
        <div className="col-span-2">
          <h2 className="text-sm font-bold text-slate-900 mb-3 border-b-2 border-sky-500 pb-1">
            Experience
          </h2>
          {data.experience.slice(0, 2).map((exp) => (
            <div
              key={exp.id}
              className="mb-3 p-3 bg-slate-50 rounded border-l-3 border-sky-500"
            >
              <div className="flex justify-between items-start mb-1">
                <div>
                  <h3 className="font-bold text-slate-900 text-xs">
                    {exp.jobTitle}
                  </h3>
                  <p className="text-sky-600 text-xs font-bold">
                    {exp.company}
                  </p>
                </div>
                <span className="text-slate-500 text-xs bg-slate-200 px-2 py-1 rounded">
                  {exp.startDate} - {exp.current ? "Present" : exp.endDate}
                </span>
              </div>
              <div className="text-xs text-slate-600">
                {exp.description.slice(0, 2).map((desc, index) => (
                  <p key={index} className="mb-1">
                    → {desc.substring(0, 60)}...
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Skills & Education */}
        <div>
          <h2 className="text-sm font-bold text-slate-900 mb-3 border-b-2 border-sky-500 pb-1">
            Skills
          </h2>
          <div className="mb-4">
            <h3 className="text-xs font-bold text-slate-900 bg-slate-200 px-2 py-1 rounded mb-2">
              Technical
            </h3>
            <div className="flex flex-wrap gap-1">
              {data.skills
                .filter((s) => s.category === "technical")
                .slice(0, 6)
                .map((skill) => (
                  <span
                    key={skill.id}
                    className="text-xs bg-sky-500 text-white px-2 py-1 rounded-full"
                  >
                    {skill.name}
                  </span>
                ))}
            </div>
          </div>

          <h2 className="text-sm font-bold text-slate-900 mb-3 border-b-2 border-sky-500 pb-1 mt-4">
            Education
          </h2>
          {data.education.slice(0, 1).map((edu) => (
            <div key={edu.id} className="mb-3 p-3 bg-slate-50 rounded">
              <h3 className="font-bold text-slate-900 text-xs">{edu.degree}</h3>
              <p className="text-sky-600 text-xs">{edu.institution}</p>
              <p className="text-slate-500 text-xs">{edu.graduationDate}</p>
            </div>
          ))}

          {/* Custom Fields */}
          {data.customFields &&
            data.customFields.filter((f) => f.enabled && f.value).length >
              0 && (
              <div className="mt-4">
                <h2 className="text-sm font-bold text-slate-900 mb-3 border-b-2 border-sky-500 pb-1">
                  Additional Information
                </h2>
                <div className="space-y-2">
                  {data.customFields
                    .filter((f) => f.enabled && f.value)
                    .slice(0, 3)
                    .map((field) => (
                      <p key={field.id} className="text-xs text-slate-700">
                        • {field.name}: {field.value}
                      </p>
                    ))}
                </div>
              </div>
            )}

          {/* Dynamic Sections */}
          {data.dynamicSections &&
            data.dynamicSections.slice(0, 2).map((section) => (
              <div key={section.id} className="mt-4">
                <h2 className="text-sm font-bold text-slate-900 mb-3 border-b-2 border-sky-500 pb-1">
                  {section.title}
                </h2>
                <div className="space-y-2">
                  {section.entries.slice(0, 2).map((entry) => (
                    <div key={entry.id} className="mb-2">
                      {section.type === "projects" && (
                        <>
                          <p className="text-xs font-bold text-slate-900">
                            {entry.title || entry.name}
                          </p>
                          {entry.technologies && (
                            <p className="text-xs text-sky-600">
                              {entry.technologies}
                            </p>
                          )}
                        </>
                      )}
                      {section.type === "certificates" && (
                        <>
                          <p className="text-xs font-bold text-slate-900">
                            {entry.name || entry.title}
                          </p>
                          {entry.issuer && (
                            <p className="text-xs text-sky-600">
                              {entry.issuer}
                            </p>
                          )}
                        </>
                      )}
                      {section.type === "languages" && (
                        <div className="flex justify-between">
                          <span className="text-xs text-slate-700">
                            {entry.language || entry.name}
                          </span>
                          {entry.proficiency && (
                            <span className="text-xs text-slate-600">
                              {entry.proficiency}
                            </span>
                          )}
                        </div>
                      )}
                      {section.type === "publications" && (
                        <>
                          <p className="text-xs font-bold text-slate-900">
                            {entry.title || entry.name}
                          </p>
                          {entry.authors && (
                            <p className="text-xs text-sky-600">
                              Authors: {entry.authors}
                            </p>
                          )}
                          {entry.publisher && (
                            <p className="text-xs text-sky-600">
                              Publisher: {entry.publisher}
                            </p>
                          )}
                          {entry.description && (
                            <p className="text-xs text-slate-700">
                              {entry.description.substring(0, 60)}...
                            </p>
                          )}
                        </>
                      )}
                      {section.type !== "projects" &&
                        section.type !== "certificates" &&
                        section.type !== "languages" &&
                        section.type !== "publications" && (
                          <p className="text-xs font-bold text-slate-900">
                            {entry.title || entry.name}
                          </p>
                        )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

          {/* Code Sample */}
          <h2 className="text-sm font-bold text-slate-900 mb-3 border-b-2 border-sky-500 pb-1 mt-4">
            Code Sample
          </h2>
          <div className="bg-slate-900 text-slate-200 p-2 rounded text-xs font-mono">
            <div>const dev = {"{"}</div>
            <div> name: "{data.personalInfo.fullName.split(" ")[0]}",</div>
            <div> skills: ["React"]</div>
            <div>{"};"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
