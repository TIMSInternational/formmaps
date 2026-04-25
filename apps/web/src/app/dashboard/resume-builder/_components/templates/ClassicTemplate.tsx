import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// Define styles for the Classic template
const classicStyles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 40,
    fontFamily: "Times-Roman",
  },
  header: {
    alignItems: "center",
    marginBottom: 18,
    paddingBottom: 8,
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 4,
    textAlign: "center",
  },
  contactSection: {
    alignItems: "center",
    width: "100%",
    marginBottom: 6,
  },
  contactRow: {
    fontSize: 10,
    color: "#000000",
    marginBottom: 2,
    textAlign: "center",
  },
  professionalTitle: {
    fontSize: 12,
    fontStyle: "italic",
    color: "#000000",
    marginBottom: 6,
  },
  summary: {
    fontSize: 11,
    lineHeight: 1.4,
    color: "#000000",
    textAlign: "center",
    marginTop: 6,
    fontStyle: "italic",
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#000000",
    paddingBottom: 3,
    marginBottom: 6,
    textAlign: "left",
    textTransform: "uppercase",
    letterSpacing: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
  },
  experienceItem: {
    marginBottom: 8,
  },
  jobHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  jobTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#000000",
  },
  company: {
    fontSize: 11,
    color: "#000000",
    fontStyle: "italic",
    marginBottom: 2,
  },
  dateLocation: {
    fontSize: 10,
    color: "#000000",
    textAlign: "right",
  },
  description: {
    fontSize: 10,
    lineHeight: 1.3,
    color: "#000000",
    marginTop: 2,
    marginLeft: 6,
  },
  skillsContainer: {
    flexDirection: "column",
  },
  skillCategory: {
    marginBottom: 5,
  },
  skillCategoryTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 3,
  },
  skillsList: {
    fontSize: 10,
    color: "#000000",
    lineHeight: 1.2,
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
    languages?: string;
    maritalStatus?: string;
    driversLicense?: string;
    militaryService?: string;
    visaStatus?: string;
    preferredPronouns?: string;
    summary: string;
    careerObjective?: string;
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
    description?: string;
    bullets?: string;
    entries: Array<{
      id: string;
      [key: string]: any;
    }>;
  }>;
}

interface ClassicTemplatePDFProps {
  data: ResumeData;
}

export const ClassicTemplatePDF: React.FC<ClassicTemplatePDFProps> = ({
  data,
}) => {
  // Debug logging
  console.log("=== CLASSIC TEMPLATE RENDERING ===");
  console.log("Personal Info received:", data.personalInfo);
  console.log("Professional Title:", data.personalInfo.professionalTitle);
  console.log("GitHub:", data.personalInfo.github);
  console.log("Twitter:", data.personalInfo.twitter);
  console.log("Nationality:", data.personalInfo.nationality);
  console.log("Date of Birth:", data.personalInfo.dateOfBirth);

  // Group skills by category
  const skillsByCategory = data.skills.reduce((acc, skill) => {
    if (!acc[skill.category]) {
      acc[skill.category] = [];
    }
    acc[skill.category].push(skill.name);
    return acc;
  }, {} as Record<string, string[]>);

  // Flatten all skills into a single list
  const allSkills = data.skills.map((skill) => skill.name);

  const { personalInfo, customFields } = data;

  const baseContactItems = [
    personalInfo.phone,
    personalInfo.email,
    personalInfo.location,
  ].filter(Boolean) as string[];

  const linkItems: string[] = [];

  if (personalInfo.linkedin) {
    linkItems.push(personalInfo.linkedin);
  }

  if (personalInfo.website) {
    linkItems.push(personalInfo.website);
  }

  if (personalInfo.portfolio) {
    linkItems.push(personalInfo.portfolio);
  }

  if (personalInfo.github) {
    linkItems.push(personalInfo.github);
  }

  if (personalInfo.twitter) {
    linkItems.push(personalInfo.twitter);
  }

  const customContactItems = (customFields ?? [])
    .filter((field) => field.enabled && field.value)
    .map((field) => `${field.name}: ${field.value}`);

  const contactRows: string[][] = [];

  if (baseContactItems.length > 0) {
    const firstRow = [...baseContactItems];
    if (linkItems.length > 0) {
      firstRow.push(linkItems.shift() as string);
    }
    contactRows.push(firstRow);
  }

  while (linkItems.length > 0) {
    contactRows.push(linkItems.splice(0, 3));
  }

  if (customContactItems.length > 0) {
    for (let i = 0; i < customContactItems.length; i += 3) {
      contactRows.push(customContactItems.slice(i, i + 3));
    }
  }

  const additionalInfo: string[] = [];
  if (personalInfo.nationality) {
    additionalInfo.push(`Nationality: ${personalInfo.nationality}`);
  }
  if (personalInfo.dateOfBirth) {
    additionalInfo.push(`DOB: ${personalInfo.dateOfBirth}`);
  }

  return (
    <Document>
      <Page size="A4" style={classicStyles.page}>
        {/* Header */}
        <View style={classicStyles.header}>
          <Text style={classicStyles.name}>{personalInfo.fullName}</Text>
          {personalInfo.professionalTitle && (
            <Text style={classicStyles.professionalTitle}>
              {personalInfo.professionalTitle}
            </Text>
          )}
          {contactRows.length > 0 && (
            <View style={classicStyles.contactSection}>
              {contactRows.map((row, index) => (
                <Text key={index} style={classicStyles.contactRow}>
                  {row.join(" | ")}
                </Text>
              ))}
            </View>
          )}

          {additionalInfo.length > 0 && (
            <Text style={classicStyles.contactRow}>
              {additionalInfo.join(" | ")}
            </Text>
          )}

          {personalInfo.summary && (
            <Text style={classicStyles.summary}>{personalInfo.summary}</Text>
          )}
        </View>

        {/* Career Objective */}
        {personalInfo.careerObjective && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionTitle}>Career Objective</Text>
            <Text style={classicStyles.description}>
              {personalInfo.careerObjective}
            </Text>
          </View>
        )}

        {/* Custom fields are merged into contact items for Classic template */}

        {/* Experience */}
        {data.experience.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionTitle}>
              Professional Experience
            </Text>
            {data.experience.map((exp) => (
              <View key={exp.id} style={classicStyles.experienceItem}>
                <View style={classicStyles.jobHeader}>
                  <View>
                    <Text style={classicStyles.jobTitle}>{exp.jobTitle}</Text>
                    <Text style={classicStyles.company}>
                      {exp.company}, {exp.location}
                    </Text>
                  </View>
                  <View>
                    <Text style={classicStyles.dateLocation}>
                      {exp.startDate} - {exp.current ? "Present" : exp.endDate}
                    </Text>
                  </View>
                </View>
                {exp.description.map((desc, index) => (
                  <Text key={index} style={classicStyles.description}>
                    • {desc}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionTitle}>Education</Text>
            {data.education.map((edu) => (
              <View key={edu.id} style={classicStyles.experienceItem}>
                <View style={classicStyles.jobHeader}>
                  <View>
                    <Text style={classicStyles.jobTitle}>{edu.degree}</Text>
                    <Text style={classicStyles.company}>
                      {edu.institution}, {edu.location}
                    </Text>
                  </View>
                  <View>
                    <Text style={classicStyles.dateLocation}>
                      {edu.graduationDate}
                    </Text>
                  </View>
                </View>
                {edu.gpa && (
                  <Text style={classicStyles.description}>GPA: {edu.gpa}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionTitle}>
              Skills & Competencies
            </Text>
            <View style={classicStyles.skillsContainer}>
              <Text style={classicStyles.skillsList}>
                {allSkills.join(", ")}
              </Text>
            </View>
          </View>
        )}

        {/* Dynamic Sections */}
        {data.dynamicSections &&
          data.dynamicSections.map((section) => {
            // Type assertion for custom sections
            const customSection = section as typeof section & {
              description?: string;
              bullets?: string;
            };

            return (
              <View key={section.id} style={classicStyles.section}>
                <Text style={classicStyles.sectionTitle}>{section.title}</Text>
                {/* Custom sections render directly without entries */}
                {section.type === "custom" ? (
                  <View style={classicStyles.experienceItem}>
                    {customSection.description && (
                      <Text style={classicStyles.description}>
                        {customSection.description}
                      </Text>
                    )}
                    {customSection.bullets &&
                      (() => {
                        const lines = customSection.bullets
                          .split("\n")
                          .filter((line: string) => line.trim());

                        return lines.map((line: string, index: number) => (
                          <Text key={index} style={classicStyles.description}>
                            • {line.trim()}
                          </Text>
                        ));
                      })()}
                  </View>
                ) : (
                  section.entries.map((entry) => (
                    <View key={entry.id} style={classicStyles.experienceItem}>
                      {/* Render based on section type */}
                      {section.type === "projects" && (
                        <>
                          <View style={classicStyles.jobHeader}>
                            <Text style={classicStyles.jobTitle}>
                              {entry.title || entry.name}
                            </Text>
                            {entry.date && (
                              <Text style={classicStyles.dateLocation}>
                                {entry.date}
                              </Text>
                            )}
                          </View>
                          {entry.technologies && (
                            <Text style={classicStyles.company}>
                              Technologies: {entry.technologies}
                            </Text>
                          )}
                          {entry.description && (
                            <Text style={classicStyles.description}>
                              {entry.description}
                            </Text>
                          )}
                          {entry.link && (
                            <Text style={classicStyles.description}>
                              Link: {entry.link}
                            </Text>
                          )}
                        </>
                      )}
                      {section.type === "certificates" && (
                        <>
                          <View style={classicStyles.jobHeader}>
                            <Text style={classicStyles.jobTitle}>
                              {entry.name || entry.title}
                            </Text>
                            {entry.date && (
                              <Text style={classicStyles.dateLocation}>
                                {entry.date}
                              </Text>
                            )}
                          </View>
                          {entry.issuer && (
                            <Text style={classicStyles.company}>
                              {entry.issuer}
                            </Text>
                          )}
                          {entry.description && (
                            <Text style={classicStyles.description}>
                              {entry.description}
                            </Text>
                          )}
                        </>
                      )}
                      {section.type === "languages" && (
                        <>
                          <Text style={classicStyles.jobTitle}>
                            {entry.language || entry.name}
                          </Text>
                          {entry.proficiency && (
                            <Text style={classicStyles.company}>
                              Proficiency: {entry.proficiency}
                            </Text>
                          )}
                        </>
                      )}
                      {section.type === "publications" && (
                        <>
                          <View style={classicStyles.jobHeader}>
                            <Text style={classicStyles.jobTitle}>
                              {entry.title || entry.name}
                            </Text>
                            {entry.date && (
                              <Text style={classicStyles.dateLocation}>
                                {entry.date}
                              </Text>
                            )}
                          </View>
                          {entry.authors && (
                            <Text style={classicStyles.company}>
                              Authors: {entry.authors}
                            </Text>
                          )}
                          {entry.publisher && (
                            <Text style={classicStyles.company}>
                              Publisher: {entry.publisher}
                            </Text>
                          )}
                          {entry.description && (
                            <Text style={classicStyles.description}>
                              {entry.description}
                            </Text>
                          )}
                          {entry.link && (
                            <Text style={classicStyles.description}>
                              Link: {entry.link}
                            </Text>
                          )}
                        </>
                      )}
                      {section.type === "courses" && (
                        <>
                          <View style={classicStyles.jobHeader}>
                            <Text style={classicStyles.jobTitle}>
                              {entry.name || entry.title}
                            </Text>
                            {entry.date && (
                              <Text style={classicStyles.dateLocation}>
                                {entry.date}
                              </Text>
                            )}
                          </View>
                          {entry.institution && (
                            <Text style={classicStyles.company}>
                              {entry.institution}
                            </Text>
                          )}
                          {entry.description && (
                            <Text style={classicStyles.description}>
                              {entry.description}
                            </Text>
                          )}
                        </>
                      )}
                      {section.type === "awards" && (
                        <>
                          <View style={classicStyles.jobHeader}>
                            <Text style={classicStyles.jobTitle}>
                              {entry.title || entry.name}
                            </Text>
                            {entry.date && (
                              <Text style={classicStyles.dateLocation}>
                                {entry.date}
                              </Text>
                            )}
                          </View>
                          {entry.issuer && (
                            <Text style={classicStyles.company}>
                              {entry.issuer}
                            </Text>
                          )}
                          {entry.description && (
                            <Text style={classicStyles.description}>
                              {entry.description}
                            </Text>
                          )}
                        </>
                      )}
                      {section.type === "organisations" && (
                        <>
                          <View style={classicStyles.jobHeader}>
                            <View>
                              <Text style={classicStyles.jobTitle}>
                                {entry.name || entry.title}
                              </Text>
                              {entry.role && (
                                <Text style={classicStyles.company}>
                                  {entry.role}
                                </Text>
                              )}
                            </View>
                            {(entry.startDate || entry.endDate) && (
                              <Text style={classicStyles.dateLocation}>
                                {entry.startDate}
                                {entry.startDate && entry.endDate && " - "}
                                {entry.endDate}
                              </Text>
                            )}
                          </View>
                          {entry.description && (
                            <Text style={classicStyles.description}>
                              {entry.description}
                            </Text>
                          )}
                        </>
                      )}
                      {section.type === "interests" && (
                        <>
                          <Text style={classicStyles.jobTitle}>
                            {entry.interest || entry.name || entry.title}
                          </Text>
                          {entry.description && (
                            <Text style={classicStyles.description}>
                              {entry.description}
                            </Text>
                          )}
                        </>
                      )}
                      {section.type === "references" && (
                        <>
                          <Text style={classicStyles.jobTitle}>
                            {entry.name || entry.title}
                          </Text>
                          {entry.position && (
                            <Text style={classicStyles.company}>
                              {entry.position}
                              {entry.company && `, ${entry.company}`}
                            </Text>
                          )}
                          {!entry.position && entry.company && (
                            <Text style={classicStyles.company}>
                              {entry.company}
                            </Text>
                          )}
                          {entry.email && (
                            <Text style={classicStyles.description}>
                              Email: {entry.email}
                            </Text>
                          )}
                          {entry.phone && (
                            <Text style={classicStyles.description}>
                              Phone: {entry.phone}
                            </Text>
                          )}
                        </>
                      )}
                      {section.type === "declaration" && (
                        <>
                          {entry.text && (
                            <Text style={classicStyles.description}>
                              {entry.text}
                            </Text>
                          )}
                          {(entry.place || entry.date) && (
                            <Text
                              style={[
                                classicStyles.description,
                                { marginTop: 4, fontStyle: "italic" },
                              ]}
                            >
                              {entry.place && `Place: ${entry.place}`}
                              {entry.place && entry.date && " | "}
                              {entry.date && `Date: ${entry.date}`}
                            </Text>
                          )}
                        </>
                      )}

                      {/* Generic rendering for any other section types not explicitly handled */}
                      {section.type !== "projects" &&
                        section.type !== "certificates" &&
                        section.type !== "languages" &&
                        section.type !== "publications" &&
                        section.type !== "courses" &&
                        section.type !== "awards" &&
                        section.type !== "organisations" &&
                        section.type !== "interests" &&
                        section.type !== "references" &&
                        section.type !== "declaration" &&
                        section.type !== "custom" && (
                          <>
                            <Text style={classicStyles.jobTitle}>
                              {entry.title || entry.name}
                            </Text>
                            {entry.subtitle && (
                              <Text style={classicStyles.company}>
                                {entry.subtitle}
                              </Text>
                            )}
                            {entry.date && (
                              <Text style={classicStyles.dateLocation}>
                                {entry.date}
                              </Text>
                            )}
                            {entry.description && (
                              <Text style={classicStyles.description}>
                                {entry.description}
                              </Text>
                            )}
                            {entry.content && (
                              <Text style={classicStyles.description}>
                                {entry.content}
                              </Text>
                            )}
                          </>
                        )}
                    </View>
                  ))
                )}
              </View>
            );
          })}
      </Page>
    </Document>
  );
};

// Preview component for the template selector
export function ClassicTemplatePreview({ data }: ClassicTemplatePDFProps) {
  // Group skills by category
  const skillsByCategory = data.skills.reduce((acc, skill) => {
    if (!acc[skill.category]) {
      acc[skill.category] = [];
    }
    acc[skill.category].push(skill.name);
    return acc;
  }, {} as Record<string, string[]>);

  // Flatten all skills into a single list
  const allSkills = data.skills.map((skill) => skill.name);

  const { personalInfo, customFields } = data;

  const baseContactItems = [
    personalInfo.phone,
    personalInfo.email,
    personalInfo.location,
  ].filter(Boolean) as string[];

  const linkItems: string[] = [];

  if (personalInfo.linkedin) {
    linkItems.push(personalInfo.linkedin);
  }

  if (personalInfo.website) {
    linkItems.push(personalInfo.website);
  }

  if (personalInfo.portfolio) {
    linkItems.push(personalInfo.portfolio);
  }

  if (personalInfo.github) {
    linkItems.push(personalInfo.github);
  }

  if (personalInfo.twitter) {
    linkItems.push(personalInfo.twitter);
  }

  const customContactItems = (customFields ?? [])
    .filter((field) => field.enabled && field.value)
    .map((field) => `${field.name}: ${field.value}`);

  const contactRows: string[][] = [];

  if (baseContactItems.length > 0) {
    const firstRow = [...baseContactItems];
    if (linkItems.length > 0) {
      firstRow.push(linkItems.shift() as string);
    }
    contactRows.push(firstRow);
  }

  while (linkItems.length > 0) {
    contactRows.push(linkItems.splice(0, 3));
  }

  if (customContactItems.length > 0) {
    for (let i = 0; i < customContactItems.length; i += 3) {
      contactRows.push(customContactItems.slice(i, i + 3));
    }
  }

  const additionalInfo: string[] = [];
  if (personalInfo.nationality) {
    additionalInfo.push(`Nationality: ${personalInfo.nationality}`);
  }
  if (personalInfo.dateOfBirth) {
    additionalInfo.push(`DOB: ${personalInfo.dateOfBirth}`);
  }

  return (
    <div className="w-full h-full bg-white p-6 text-xs overflow-hidden">
      {/* Header */}
      <div className="text-center mb-2">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {personalInfo.fullName}
        </h1>
        {personalInfo.professionalTitle && (
          <p className="text-gray-600 text-sm italic mb-1">
            {personalInfo.professionalTitle}
          </p>
        )}
        <div className="text-gray-600 text-xs space-y-1">
          {contactRows.map((row, index) => (
            <p key={index}>{row.join(" | ")}</p>
          ))}
          {additionalInfo.length > 0 && <p>{additionalInfo.join(" | ")}</p>}
        </div>
      </div>

      {/* Summary */}
      {personalInfo.summary && (
        <div className="mb-2">
          <h2 className="text-sm font-bold text-gray-900 mb-1 pb-1 border-b border-black tracking-widest text-left">
            PROFESSIONAL SUMMARY
          </h2>
          <p className="text-gray-700 text-xs leading-relaxed">
            {personalInfo.summary.substring(0, 200)}...
          </p>
        </div>
      )}

      {/* Career Objective */}
      {personalInfo.careerObjective && (
        <div className="mb-2">
          <h2 className="text-sm font-bold text-gray-900 mb-1 pb-1 border-b border-black tracking-widest text-left">
            CAREER OBJECTIVE
          </h2>
          <p className="text-gray-700 text-xs leading-relaxed">
            {personalInfo.careerObjective.substring(0, 150)}...
          </p>
        </div>
      )}

      {/* Experience */}
      {data.experience.length > 0 && (
        <div className="mb-2">
          <h2 className="text-sm font-bold text-gray-900 mb-1 pb-1 border-b border-black tracking-widest text-left">
            PROFESSIONAL EXPERIENCE
          </h2>
          {data.experience.slice(0, 2).map((exp) => (
            <div key={exp.id} className="mb-2">
              <div className="flex justify-between items-start mb-1">
                <div>
                  <h3 className="font-bold text-gray-900 text-xs">
                    {exp.jobTitle}
                  </h3>
                  <p className="text-gray-700 text-xs">
                    {exp.company}, {exp.location}
                  </p>
                </div>
                <span className="text-gray-600 text-xs">
                  {exp.startDate} - {exp.current ? "Present" : exp.endDate}
                </span>
              </div>
              <div className="text-xs text-gray-700">
                {exp.description.slice(0, 2).map((desc, index) => (
                  <p key={index} className="mb-1">
                    • {desc.substring(0, 80)}...
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Education */}
        {data.education.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-900 mb-1 pb-1 border-b border-black tracking-widest text-left">
              EDUCATION
            </h2>
            {data.education.slice(0, 1).map((edu) => (
              <div key={edu.id} className="mb-2">
                <h3 className="font-bold text-gray-900 text-xs">
                  {edu.degree}
                </h3>
                <p className="text-gray-700 text-xs">
                  {edu.institution}, {edu.location}
                </p>
                <p className="text-gray-600 text-xs">{edu.graduationDate}</p>
                {edu.gpa && (
                  <p className="text-gray-600 text-xs">GPA: {edu.gpa}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-900 mb-1 pb-1 border-b border-black tracking-widest text-left">
              SKILLS & COMPETENCIES
            </h2>
            <div className="space-y-2">
              <p className="text-gray-700 text-xs">
                {allSkills.slice(0, 8).join(", ")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Dynamic Sections */}
      {data.dynamicSections &&
        data.dynamicSections.slice(0, 2).map((section) => {
          // Type assertion for custom sections
          const customSection = section as typeof section & {
            description?: string;
            bullets?: string;
          };

          return (
            <div key={section.id} className="mb-2">
              <h2 className="text-sm font-bold text-gray-900 mb-1 pb-1 border-b border-black tracking-widest text-left">
                {section.title.toUpperCase()}
              </h2>
              {/* Custom sections render directly without entries */}
              {section.type === "custom" ? (
                <div className="mb-2">
                  {customSection.description && (
                    <p className="text-gray-700 text-xs mb-1">
                      {customSection.description.substring(0, 150)}
                      {customSection.description.length > 150 ? "..." : ""}
                    </p>
                  )}
                  {customSection.bullets &&
                    (() => {
                      const lines = customSection.bullets
                        .split("\n")
                        .filter((line: string) => line.trim());

                      return (
                        <ul className="list-disc list-inside text-gray-700 text-xs space-y-0.5">
                          {lines
                            .slice(0, 3)
                            .map((line: string, index: number) => (
                              <li key={index}>
                                {line.trim().substring(0, 60)}
                                {line.trim().length > 60 ? "..." : ""}
                              </li>
                            ))}
                          {lines.length > 3 && (
                            <li className="text-gray-500">...</li>
                          )}
                        </ul>
                      );
                    })()}
                </div>
              ) : (
                section.entries.slice(0, 1).map((entry) => (
                  <div key={entry.id} className="mb-2">
                    {section.type === "projects" && (
                      <>
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-gray-900 text-xs">
                            {entry.title || entry.name}
                          </h3>
                          {entry.date && (
                            <span className="text-gray-600 text-xs">
                              {entry.date}
                            </span>
                          )}
                        </div>
                        {entry.technologies && (
                          <p className="text-gray-700 text-xs italic">
                            Technologies: {entry.technologies}
                          </p>
                        )}
                        {entry.description && (
                          <p className="text-gray-700 text-xs">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "certificates" && (
                      <>
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-gray-900 text-xs">
                            {entry.name || entry.title}
                          </h3>
                          {entry.date && (
                            <span className="text-gray-600 text-xs">
                              {entry.date}
                            </span>
                          )}
                        </div>
                        {entry.issuer && (
                          <p className="text-gray-700 text-xs italic">
                            {entry.issuer}
                          </p>
                        )}
                        {entry.description && (
                          <p className="text-gray-700 text-xs">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "languages" && (
                      <>
                        <h3 className="font-bold text-gray-900 text-xs">
                          {entry.language || entry.name}
                        </h3>
                        {entry.proficiency && (
                          <p className="text-gray-700 text-xs italic">
                            Proficiency: {entry.proficiency}
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "publications" && (
                      <>
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-gray-900 text-xs">
                            {entry.title || entry.name}
                          </h3>
                          {entry.date && (
                            <span className="text-gray-600 text-xs">
                              {entry.date}
                            </span>
                          )}
                        </div>
                        {entry.authors && (
                          <p className="text-gray-700 text-xs italic">
                            Authors: {entry.authors}
                          </p>
                        )}
                        {entry.publisher && (
                          <p className="text-gray-700 text-xs italic">
                            Publisher: {entry.publisher}
                          </p>
                        )}
                        {entry.description && (
                          <p className="text-gray-700 text-xs">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "courses" && (
                      <>
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-gray-900 text-xs">
                            {entry.name || entry.title}
                          </h3>
                          {entry.date && (
                            <span className="text-gray-600 text-xs">
                              {entry.date}
                            </span>
                          )}
                        </div>
                        {entry.institution && (
                          <p className="text-gray-700 text-xs italic">
                            {entry.institution}
                          </p>
                        )}
                        {entry.description && (
                          <p className="text-gray-700 text-xs">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "awards" && (
                      <>
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-gray-900 text-xs">
                            {entry.title || entry.name}
                          </h3>
                          {entry.date && (
                            <span className="text-gray-600 text-xs">
                              {entry.date}
                            </span>
                          )}
                        </div>
                        {entry.issuer && (
                          <p className="text-gray-700 text-xs italic">
                            {entry.issuer}
                          </p>
                        )}
                        {entry.description && (
                          <p className="text-gray-700 text-xs">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "organisations" && (
                      <>
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold text-gray-900 text-xs">
                              {entry.name || entry.title}
                            </h3>
                            {entry.role && (
                              <p className="text-gray-700 text-xs italic">
                                {entry.role}
                              </p>
                            )}
                          </div>
                          {(entry.startDate || entry.endDate) && (
                            <span className="text-gray-600 text-xs">
                              {entry.startDate}
                              {entry.startDate && entry.endDate && " - "}
                              {entry.endDate}
                            </span>
                          )}
                        </div>
                        {entry.description && (
                          <p className="text-gray-700 text-xs">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "interests" && (
                      <>
                        <h3 className="font-bold text-gray-900 text-xs">
                          {entry.interest || entry.name || entry.title}
                        </h3>
                        {entry.description && (
                          <p className="text-gray-700 text-xs">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "references" && (
                      <>
                        <h3 className="font-bold text-gray-900 text-xs">
                          {entry.name || entry.title}
                        </h3>
                        {entry.position && (
                          <p className="text-gray-700 text-xs italic">
                            {entry.position}
                            {entry.company && `, ${entry.company}`}
                          </p>
                        )}
                        {!entry.position && entry.company && (
                          <p className="text-gray-700 text-xs italic">
                            {entry.company}
                          </p>
                        )}
                        {entry.email && (
                          <p className="text-gray-700 text-xs">
                            Email: {entry.email}
                          </p>
                        )}
                        {entry.phone && (
                          <p className="text-gray-700 text-xs">
                            Phone: {entry.phone}
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "declaration" && (
                      <>
                        {entry.text && (
                          <p className="text-gray-700 text-xs">
                            {entry.text.substring(0, 100)}...
                          </p>
                        )}
                        {(entry.place || entry.date) && (
                          <p className="text-gray-700 text-xs italic mt-1">
                            {entry.place && `Place: ${entry.place}`}
                            {entry.place && entry.date && " | "}
                            {entry.date && `Date: ${entry.date}`}
                          </p>
                        )}
                      </>
                    )}

                    {/* Generic fallback for any other section types */}
                    {section.type !== "projects" &&
                      section.type !== "certificates" &&
                      section.type !== "languages" &&
                      section.type !== "publications" &&
                      section.type !== "courses" &&
                      section.type !== "awards" &&
                      section.type !== "organisations" &&
                      section.type !== "interests" &&
                      section.type !== "references" &&
                      section.type !== "declaration" &&
                      section.type !== "custom" && (
                        <>
                          <h3 className="font-bold text-gray-900 text-xs">
                            {entry.title || entry.name}
                          </h3>
                          {entry.subtitle && (
                            <p className="text-gray-700 text-xs">
                              {entry.subtitle}
                            </p>
                          )}
                          {entry.description && (
                            <p className="text-gray-700 text-xs">
                              {entry.description.substring(0, 80)}...
                            </p>
                          )}
                        </>
                      )}
                  </div>
                ))
              )}
            </div>
          );
        })}
    </div>
  );
}
