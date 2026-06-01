import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// Classic template styles — single-page SWE resume, tight spacing
const classicStyles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 40,
    fontFamily: "Times-Roman",
    fontSize: 9.5,
    color: "#000000",
  },
  header: {
    alignItems: "center",
    marginBottom: 4,
  },
  name: {
    fontSize: 22,
    fontFamily: "Times-Bold",
    color: "#000000",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 1,
  },
  contactRow: {
    fontSize: 8.5,
    color: "#000000",
    textAlign: "center",
    lineHeight: 1.3,
  },
  section: {
    marginBottom: 3,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: "Times-Bold",
    color: "#000000",
    paddingBottom: 1,
    marginBottom: 2,
    marginTop: 1,
    textTransform: "uppercase",
    borderBottomWidth: 0.75,
    borderBottomColor: "#000000",
  },
  entryItem: {
    marginBottom: 3,
  },
  entryHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  entryBoldLeft: {
    fontSize: 9.5,
    fontFamily: "Times-Bold",
    color: "#000000",
    maxWidth: "72%",
  },
  entryDateRight: {
    fontSize: 9.5,
    color: "#000000",
    textAlign: "right",
  },
  entryItalicLeft: {
    fontSize: 9.5,
    fontFamily: "Times-Italic",
    color: "#000000",
    maxWidth: "72%",
  },
  entryItalicRight: {
    fontSize: 9.5,
    fontFamily: "Times-Italic",
    color: "#000000",
    textAlign: "right",
  },
  entryDetail: {
    fontSize: 9.5,
    color: "#000000",
    fontFamily: "Times-Italic",
  },
  bulletText: {
    fontSize: 9.5,
    lineHeight: 1.25,
    color: "#000000",
    marginLeft: 8,
    marginTop: 0.5,
    textAlign: "justify",
  },
  skillLine: {
    fontSize: 9.5,
    lineHeight: 1.3,
    color: "#000000",
    marginBottom: 0.5,
  },
  skillCategory: {
    fontFamily: "Times-Bold",
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
  // Group skills by category
  const skillsByCategory = data.skills.reduce((acc, skill) => {
    if (!acc[skill.category]) {
      acc[skill.category] = [];
    }
    acc[skill.category].push(skill.name);
    return acc;
  }, {} as Record<string, string[]>);

  const { personalInfo, customFields } = data;

  // Build contact lines: line 1 = phone | email | linkedin, line 2 = github | website
  const contactLine1: string[] = [];
  const contactLine2: string[] = [];
  if (personalInfo.phone) contactLine1.push(personalInfo.phone);
  if (personalInfo.email) contactLine1.push(personalInfo.email);
  if (personalInfo.linkedin) contactLine1.push(personalInfo.linkedin);
  if (personalInfo.github) contactLine2.push(personalInfo.github);
  if (personalInfo.website) contactLine2.push(personalInfo.website);
  if (personalInfo.portfolio) contactLine2.push(personalInfo.portfolio);
  if (personalInfo.location && contactLine1.length < 4) contactLine1.push(personalInfo.location);
  else if (personalInfo.location) contactLine2.push(personalInfo.location);

  const customContactItems = (customFields ?? [])
    .filter((field) => field.enabled && field.value)
    .map((field) => `${field.name}: ${field.value}`);
  contactLine2.push(...customContactItems);

  return (
    <Document>
      <Page size="A4" style={classicStyles.page}>
        {/* Header — Name centered large, contact below */}
        <View style={classicStyles.header}>
          <Text style={classicStyles.name}>{personalInfo.fullName}</Text>
          {contactLine1.length > 0 && (
            <Text style={classicStyles.contactRow}>
              {contactLine1.join("  |  ")}
            </Text>
          )}
          {contactLine2.length > 0 && (
            <Text style={classicStyles.contactRow}>
              {contactLine2.join(" | ")}
            </Text>
          )}
        </View>

        {/* Career Objective */}
        {personalInfo.careerObjective && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionTitle}>Career Objective</Text>
            <Text style={classicStyles.bulletText}>
              {personalInfo.careerObjective}
            </Text>
          </View>
        )}

        {/* Summary */}
        {personalInfo.summary && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionTitle}>Summary</Text>
            <Text style={classicStyles.bulletText}>
              {personalInfo.summary}
            </Text>
          </View>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionTitle}>Education</Text>
            {data.education.map((edu) => (
              <View key={edu.id} style={classicStyles.entryItem}>
                <View style={classicStyles.entryHeaderRow}>
                  <Text style={classicStyles.entryBoldLeft}>
                    {edu.institution}
                  </Text>
                  <Text style={classicStyles.entryDateRight}>
                    {edu.location}
                  </Text>
                </View>
                <View style={classicStyles.entryHeaderRow}>
                  <Text style={classicStyles.entryItalicLeft}>
                    {edu.degree}
                  </Text>
                  <Text style={classicStyles.entryItalicRight}>
                    {edu.graduationDate || ""}
                  </Text>
                </View>
                {edu.gpa && (
                  <Text style={{ fontSize: 9.5, color: "#000000" }}>
                    Overall GPA: {edu.gpa}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Experience */}
        {data.experience.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionTitle}>
              Relevant Experience
            </Text>
            {data.experience.map((exp) => (
              <View key={exp.id} style={classicStyles.entryItem}>
                <View style={classicStyles.entryHeaderRow}>
                  <Text style={classicStyles.entryBoldLeft}>
                    {exp.company}
                  </Text>
                  <Text style={classicStyles.entryDateRight}>
                    {exp.location}
                  </Text>
                </View>
                <View style={classicStyles.entryHeaderRow}>
                  <Text style={classicStyles.entryItalicLeft}>
                    {exp.jobTitle}
                  </Text>
                  <Text style={classicStyles.entryItalicRight}>
                    {exp.startDate} - {exp.current ? "Present" : exp.endDate}
                  </Text>
                </View>
                {exp.description.map((desc, index) => (
                  <Text key={index} style={classicStyles.bulletText}>
                    {"•"} {desc}
                  </Text>
                ))}
              </View>
            ))}
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
                  <View style={classicStyles.entryItem}>
                    {customSection.description && (
                      <Text style={classicStyles.bulletText}>
                        {customSection.description}
                      </Text>
                    )}
                    {customSection.bullets &&
                      (() => {
                        const lines = customSection.bullets
                          .split("\n")
                          .filter((line: string) => line.trim());

                        return lines.map((line: string, index: number) => (
                          <Text key={index} style={classicStyles.bulletText}>
                            {"•"} {line.trim()}
                          </Text>
                        ));
                      })()}
                  </View>
                ) : (
                  section.entries.map((entry) => (
                    <View key={entry.id} style={classicStyles.entryItem}>
                      {/* Projects */}
                      {section.type === "projects" && (
                        <>
                          <View style={classicStyles.entryHeaderRow}>
                            <Text style={classicStyles.entryBoldLeft}>
                              {entry.title || entry.name}
                            </Text>
                            {entry.date && (
                              <Text style={classicStyles.entryDateRight}>
                                {entry.date}
                              </Text>
                            )}
                          </View>
                          {entry.technologies && (
                            <Text style={classicStyles.entryItalicLeft}>
                              Technologies: {entry.technologies}
                            </Text>
                          )}
                          {entry.description &&
                            (typeof entry.description === "string"
                              ? entry.description
                                  .split("\n")
                                  .filter((l: string) => l.trim())
                              : Array.isArray(entry.description)
                              ? entry.description
                              : [entry.description]
                            ).map((line: string, i: number) => (
                              <Text key={i} style={classicStyles.bulletText}>
                                {"•"} {typeof line === "string" ? line.trim() : line}
                              </Text>
                            ))}
                          {entry.link && (
                            <Text style={classicStyles.bulletText}>
                              Link: {entry.link}
                            </Text>
                          )}
                        </>
                      )}
                      {/* Certificates */}
                      {(section.type === "certificates" || section.type === "certifications") && (
                        <>
                          <View style={classicStyles.entryHeaderRow}>
                            <Text style={classicStyles.entryBoldLeft}>
                              {entry.name || entry.title}
                            </Text>
                            {entry.date && (
                              <Text style={classicStyles.entryDateRight}>
                                {entry.date}
                              </Text>
                            )}
                          </View>
                          {entry.issuer && (
                            <Text style={classicStyles.entryItalicLeft}>
                              {entry.issuer}
                            </Text>
                          )}
                          {entry.description && (
                            <Text style={classicStyles.bulletText}>
                              {entry.description}
                            </Text>
                          )}
                        </>
                      )}
                      {/* Languages */}
                      {section.type === "languages" && (
                        <>
                          <Text style={classicStyles.entryBoldLeft}>
                            {entry.language || entry.name}
                          </Text>
                          {entry.proficiency && (
                            <Text style={classicStyles.entryItalicLeft}>
                              Proficiency: {entry.proficiency}
                            </Text>
                          )}
                        </>
                      )}
                      {/* Publications */}
                      {section.type === "publications" && (
                        <>
                          <View style={classicStyles.entryHeaderRow}>
                            <Text style={classicStyles.entryBoldLeft}>
                              {entry.title || entry.name}
                            </Text>
                            {entry.date && (
                              <Text style={classicStyles.entryDateRight}>
                                {entry.date}
                              </Text>
                            )}
                          </View>
                          {entry.authors && (
                            <Text style={classicStyles.entryItalicLeft}>
                              Authors: {entry.authors}
                            </Text>
                          )}
                          {entry.publisher && (
                            <Text style={classicStyles.entryItalicLeft}>
                              Publisher: {entry.publisher}
                            </Text>
                          )}
                          {entry.description && (
                            <Text style={classicStyles.bulletText}>
                              {entry.description}
                            </Text>
                          )}
                          {entry.link && (
                            <Text style={classicStyles.bulletText}>
                              Link: {entry.link}
                            </Text>
                          )}
                        </>
                      )}
                      {/* Courses */}
                      {section.type === "courses" && (
                        <>
                          <View style={classicStyles.entryHeaderRow}>
                            <Text style={classicStyles.entryBoldLeft}>
                              {entry.name || entry.title}
                            </Text>
                            {entry.date && (
                              <Text style={classicStyles.entryDateRight}>
                                {entry.date}
                              </Text>
                            )}
                          </View>
                          {entry.institution && (
                            <Text style={classicStyles.entryItalicLeft}>
                              {entry.institution}
                            </Text>
                          )}
                          {entry.description && (
                            <Text style={classicStyles.bulletText}>
                              {entry.description}
                            </Text>
                          )}
                        </>
                      )}
                      {/* Awards */}
                      {section.type === "awards" && (
                        <>
                          <View style={classicStyles.entryHeaderRow}>
                            <Text style={classicStyles.entryBoldLeft}>
                              {entry.title || entry.name}
                            </Text>
                            {entry.date && (
                              <Text style={classicStyles.entryDateRight}>
                                {entry.date}
                              </Text>
                            )}
                          </View>
                          {entry.issuer && (
                            <Text style={classicStyles.entryItalicLeft}>
                              {entry.issuer}
                            </Text>
                          )}
                          {entry.description && (
                            <Text style={classicStyles.bulletText}>
                              {entry.description}
                            </Text>
                          )}
                        </>
                      )}
                      {/* Organisations */}
                      {section.type === "organisations" && (
                        <>
                          <View style={classicStyles.entryHeaderRow}>
                            <View>
                              <Text style={classicStyles.entryBoldLeft}>
                                {entry.name || entry.title}
                              </Text>
                              {entry.role && (
                                <Text style={classicStyles.entryItalicLeft}>
                                  {entry.role}
                                </Text>
                              )}
                            </View>
                            {(entry.startDate || entry.endDate) && (
                              <Text style={classicStyles.entryDateRight}>
                                {entry.startDate}
                                {entry.startDate && entry.endDate && " - "}
                                {entry.endDate}
                              </Text>
                            )}
                          </View>
                          {entry.description && (
                            <Text style={classicStyles.bulletText}>
                              {entry.description}
                            </Text>
                          )}
                        </>
                      )}
                      {/* Interests */}
                      {section.type === "interests" && (
                        <>
                          <Text style={classicStyles.entryBoldLeft}>
                            {entry.interest || entry.name || entry.title}
                          </Text>
                          {entry.description && (
                            <Text style={classicStyles.bulletText}>
                              {entry.description}
                            </Text>
                          )}
                        </>
                      )}
                      {/* References */}
                      {section.type === "references" && (
                        <>
                          <Text style={classicStyles.entryBoldLeft}>
                            {entry.name || entry.title}
                          </Text>
                          {entry.position && (
                            <Text style={classicStyles.entryItalicLeft}>
                              {entry.position}
                              {entry.company && `, ${entry.company}`}
                            </Text>
                          )}
                          {!entry.position && entry.company && (
                            <Text style={classicStyles.entryItalicLeft}>
                              {entry.company}
                            </Text>
                          )}
                          {entry.email && (
                            <Text style={classicStyles.bulletText}>
                              Email: {entry.email}
                            </Text>
                          )}
                          {entry.phone && (
                            <Text style={classicStyles.bulletText}>
                              Phone: {entry.phone}
                            </Text>
                          )}
                        </>
                      )}
                      {/* Declaration */}
                      {section.type === "declaration" && (
                        <>
                          {entry.text && (
                            <Text style={classicStyles.bulletText}>
                              {entry.text}
                            </Text>
                          )}
                          {(entry.place || entry.date) && (
                            <Text
                              style={[
                                classicStyles.bulletText,
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
                            <Text style={classicStyles.entryBoldLeft}>
                              {entry.title || entry.name}
                            </Text>
                            {entry.subtitle && (
                              <Text style={classicStyles.entryItalicLeft}>
                                {entry.subtitle}
                              </Text>
                            )}
                            {entry.date && (
                              <Text style={classicStyles.entryDateRight}>
                                {entry.date}
                              </Text>
                            )}
                            {entry.description && (
                              <Text style={classicStyles.bulletText}>
                                {entry.description}
                              </Text>
                            )}
                            {entry.content && (
                              <Text style={classicStyles.bulletText}>
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

        {/* Technical Skills - categorized with bullet labels */}
        {data.skills.length > 0 && (
          <View style={classicStyles.section}>
            <Text style={classicStyles.sectionTitle}>Technical Skills</Text>
            {Object.entries(skillsByCategory).map(
              ([category, skills], index) => (
                <Text key={index} style={classicStyles.skillLine}>
                  {"•"}{" "}
                  <Text style={{ fontFamily: "Times-Bold" }}>{category}</Text>
                  {": "}
                  {skills.join(", ")}
                </Text>
              )
            )}
          </View>
        )}
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

  const { personalInfo, customFields } = data;

  // Build single contact line
  const contactItems: string[] = [];
  if (personalInfo.phone) contactItems.push(personalInfo.phone);
  if (personalInfo.email) contactItems.push(personalInfo.email);
  if (personalInfo.linkedin) contactItems.push(personalInfo.linkedin);
  if (personalInfo.github) contactItems.push(personalInfo.github);
  if (personalInfo.website) contactItems.push(personalInfo.website);
  if (personalInfo.portfolio) contactItems.push(personalInfo.portfolio);
  if (personalInfo.twitter) contactItems.push(personalInfo.twitter);
  if (personalInfo.location) contactItems.push(personalInfo.location);

  const customContactItems = (customFields ?? [])
    .filter((field) => field.enabled && field.value)
    .map((field) => `${field.name}: ${field.value}`);
  contactItems.push(...customContactItems);

  return (
    <div className="w-full h-full bg-white p-6 text-xs overflow-hidden font-serif">
      {/* Header */}
      <div className="text-center mb-2">
        <h1 className="text-xl font-bold text-black mb-1 pb-1 border-b border-black">
          {personalInfo.fullName}
        </h1>
        {contactItems.length > 0 && (
          <p className="text-black text-[8px] mt-1">
            {contactItems.join(" | ")}
          </p>
        )}
      </div>

      {/* Summary */}
      {personalInfo.summary && (
        <div className="mb-2">
          <h2 className="text-xs font-bold text-black mb-1 pb-0.5 border-b border-black uppercase">
            Summary
          </h2>
          <p className="text-black text-[8px] leading-relaxed ml-2">
            {personalInfo.summary.substring(0, 200)}...
          </p>
        </div>
      )}

      {/* Career Objective */}
      {personalInfo.careerObjective && (
        <div className="mb-2">
          <h2 className="text-xs font-bold text-black mb-1 pb-0.5 border-b border-black uppercase">
            Career Objective
          </h2>
          <p className="text-black text-[8px] leading-relaxed ml-2">
            {personalInfo.careerObjective.substring(0, 150)}...
          </p>
        </div>
      )}

      {/* Education */}
      {data.education.length > 0 && (
        <div className="mb-2">
          <h2 className="text-xs font-bold text-black mb-1 pb-0.5 border-b border-black uppercase">
            Education
          </h2>
          {data.education.slice(0, 2).map((edu) => (
            <div key={edu.id} className="mb-1">
              <div className="flex justify-between">
                <span className="font-bold text-black text-[9px]">
                  {edu.institution}
                </span>
                <span className="text-black text-[9px]">
                  {edu.graduationDate}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="italic text-black text-[9px]">
                  {edu.degree}
                </span>
                {edu.location && (
                  <span className="italic text-black text-[9px]">
                    {edu.location}
                  </span>
                )}
              </div>
              {edu.gpa && (
                <p className="text-black text-[8px] ml-3">
                  {"•"} GPA: {edu.gpa}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Experience */}
      {data.experience.length > 0 && (
        <div className="mb-2">
          <h2 className="text-xs font-bold text-black mb-1 pb-0.5 border-b border-black uppercase">
            Relevant Experience
          </h2>
          {data.experience.slice(0, 2).map((exp) => (
            <div key={exp.id} className="mb-1">
              <div className="flex justify-between">
                <span className="font-bold text-black text-[9px]">
                  {exp.company}
                </span>
                <span className="text-black text-[9px]">
                  {exp.startDate} - {exp.current ? "Present" : exp.endDate}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="italic text-black text-[9px]">
                  {exp.jobTitle}
                </span>
                {exp.location && (
                  <span className="italic text-black text-[9px]">
                    {exp.location}
                  </span>
                )}
              </div>
              <div className="text-[8px] text-black ml-3">
                {exp.description.slice(0, 2).map((desc, index) => (
                  <p key={index} className="mb-0.5">
                    {"•"} {desc.substring(0, 80)}...
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dynamic Sections */}
      {data.dynamicSections &&
        data.dynamicSections.slice(0, 2).map((section) => {
          const customSection = section as typeof section & {
            description?: string;
            bullets?: string;
          };

          return (
            <div key={section.id} className="mb-2">
              <h2 className="text-xs font-bold text-black mb-1 pb-0.5 border-b border-black uppercase">
                {section.title}
              </h2>
              {section.type === "custom" ? (
                <div className="mb-1">
                  {customSection.description && (
                    <p className="text-black text-[8px] mb-1 ml-2">
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
                        <div className="text-black text-[8px] ml-3">
                          {lines
                            .slice(0, 3)
                            .map((line: string, index: number) => (
                              <p key={index} className="mb-0.5">
                                {"•"} {line.trim().substring(0, 60)}
                                {line.trim().length > 60 ? "..." : ""}
                              </p>
                            ))}
                          {lines.length > 3 && (
                            <p className="text-gray-500">...</p>
                          )}
                        </div>
                      );
                    })()}
                </div>
              ) : (
                section.entries.slice(0, 1).map((entry) => (
                  <div key={entry.id} className="mb-1">
                    {section.type === "projects" && (
                      <>
                        <div className="flex justify-between">
                          <span className="font-bold text-black text-[9px]">
                            {entry.title || entry.name}
                          </span>
                          {entry.date && (
                            <span className="text-black text-[9px]">
                              {entry.date}
                            </span>
                          )}
                        </div>
                        {entry.technologies && (
                          <p className="text-black text-[8px] italic">
                            Technologies: {entry.technologies}
                          </p>
                        )}
                        {entry.description && (
                          <p className="text-black text-[8px] ml-3">
                            {"•"}{" "}
                            {typeof entry.description === "string"
                              ? entry.description.substring(0, 80)
                              : ""}
                            ...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "certificates" && (
                      <>
                        <div className="flex justify-between">
                          <span className="font-bold text-black text-[9px]">
                            {entry.name || entry.title}
                          </span>
                          {entry.date && (
                            <span className="text-black text-[9px]">
                              {entry.date}
                            </span>
                          )}
                        </div>
                        {entry.issuer && (
                          <p className="text-black text-[8px] italic">
                            {entry.issuer}
                          </p>
                        )}
                        {entry.description && (
                          <p className="text-black text-[8px] ml-3">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "languages" && (
                      <>
                        <span className="font-bold text-black text-[9px]">
                          {entry.language || entry.name}
                        </span>
                        {entry.proficiency && (
                          <p className="text-black text-[8px] italic">
                            Proficiency: {entry.proficiency}
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "publications" && (
                      <>
                        <div className="flex justify-between">
                          <span className="font-bold text-black text-[9px]">
                            {entry.title || entry.name}
                          </span>
                          {entry.date && (
                            <span className="text-black text-[9px]">
                              {entry.date}
                            </span>
                          )}
                        </div>
                        {entry.authors && (
                          <p className="text-black text-[8px] italic">
                            Authors: {entry.authors}
                          </p>
                        )}
                        {entry.publisher && (
                          <p className="text-black text-[8px] italic">
                            Publisher: {entry.publisher}
                          </p>
                        )}
                        {entry.description && (
                          <p className="text-black text-[8px] ml-3">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "courses" && (
                      <>
                        <div className="flex justify-between">
                          <span className="font-bold text-black text-[9px]">
                            {entry.name || entry.title}
                          </span>
                          {entry.date && (
                            <span className="text-black text-[9px]">
                              {entry.date}
                            </span>
                          )}
                        </div>
                        {entry.institution && (
                          <p className="text-black text-[8px] italic">
                            {entry.institution}
                          </p>
                        )}
                        {entry.description && (
                          <p className="text-black text-[8px] ml-3">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "awards" && (
                      <>
                        <div className="flex justify-between">
                          <span className="font-bold text-black text-[9px]">
                            {entry.title || entry.name}
                          </span>
                          {entry.date && (
                            <span className="text-black text-[9px]">
                              {entry.date}
                            </span>
                          )}
                        </div>
                        {entry.issuer && (
                          <p className="text-black text-[8px] italic">
                            {entry.issuer}
                          </p>
                        )}
                        {entry.description && (
                          <p className="text-black text-[8px] ml-3">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "organisations" && (
                      <>
                        <div className="flex justify-between">
                          <div>
                            <span className="font-bold text-black text-[9px]">
                              {entry.name || entry.title}
                            </span>
                            {entry.role && (
                              <p className="text-black text-[8px] italic">
                                {entry.role}
                              </p>
                            )}
                          </div>
                          {(entry.startDate || entry.endDate) && (
                            <span className="text-black text-[9px]">
                              {entry.startDate}
                              {entry.startDate && entry.endDate && " - "}
                              {entry.endDate}
                            </span>
                          )}
                        </div>
                        {entry.description && (
                          <p className="text-black text-[8px] ml-3">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "interests" && (
                      <>
                        <span className="font-bold text-black text-[9px]">
                          {entry.interest || entry.name || entry.title}
                        </span>
                        {entry.description && (
                          <p className="text-black text-[8px] ml-3">
                            {entry.description.substring(0, 80)}...
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "references" && (
                      <>
                        <span className="font-bold text-black text-[9px]">
                          {entry.name || entry.title}
                        </span>
                        {entry.position && (
                          <p className="text-black text-[8px] italic">
                            {entry.position}
                            {entry.company && `, ${entry.company}`}
                          </p>
                        )}
                        {!entry.position && entry.company && (
                          <p className="text-black text-[8px] italic">
                            {entry.company}
                          </p>
                        )}
                        {entry.email && (
                          <p className="text-black text-[8px] ml-3">
                            Email: {entry.email}
                          </p>
                        )}
                        {entry.phone && (
                          <p className="text-black text-[8px] ml-3">
                            Phone: {entry.phone}
                          </p>
                        )}
                      </>
                    )}
                    {section.type === "declaration" && (
                      <>
                        {entry.text && (
                          <p className="text-black text-[8px] ml-2">
                            {entry.text.substring(0, 100)}...
                          </p>
                        )}
                        {(entry.place || entry.date) && (
                          <p className="text-black text-[8px] italic mt-1 ml-2">
                            {entry.place && `Place: ${entry.place}`}
                            {entry.place && entry.date && " | "}
                            {entry.date && `Date: ${entry.date}`}
                          </p>
                        )}
                      </>
                    )}

                    {/* Generic fallback */}
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
                          <span className="font-bold text-black text-[9px]">
                            {entry.title || entry.name}
                          </span>
                          {entry.subtitle && (
                            <p className="text-black text-[8px]">
                              {entry.subtitle}
                            </p>
                          )}
                          {entry.description && (
                            <p className="text-black text-[8px] ml-3">
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

      {/* Technical Skills */}
      {data.skills.length > 0 && (
        <div className="mb-2">
          <h2 className="text-xs font-bold text-black mb-1 pb-0.5 border-b border-black uppercase">
            Technical Skills
          </h2>
          <div className="text-[8px] text-black">
            {Object.entries(skillsByCategory).map(
              ([category, skills], index) => (
                <p key={index} className="mb-0.5">
                  {"•"} <span className="font-bold">{category}</span>:{" "}
                  {skills.join(", ")}
                </p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
