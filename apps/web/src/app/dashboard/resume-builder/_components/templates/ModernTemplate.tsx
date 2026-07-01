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

// Define styles for the Modern template
const modernStyles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 40,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#2E9098",
    paddingBottom: 15,
  },
  name: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 5,
  },
  contactInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 10,
    color: "#6b7280",
    marginBottom: 10,
  },
  contactItem: {
    marginRight: 15,
  },
  summary: {
    fontSize: 11,
    lineHeight: 1.4,
    color: "#374151",
    marginTop: 10,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 5,
  },
  experienceItem: {
    marginBottom: 15,
  },
  jobHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  jobTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1f2937",
  },
  company: {
    fontSize: 11,
    color: "#2E9098",
    marginBottom: 3,
  },
  dateLocation: {
    fontSize: 10,
    color: "#6b7280",
  },
  description: {
    fontSize: 10,
    lineHeight: 1.3,
    color: "#374151",
    marginTop: 5,
  },
  skillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  skillItem: {
    backgroundColor: "#f3f4f6",
    padding: "4 8",
    marginRight: 8,
    marginBottom: 5,
    borderRadius: 3,
    fontSize: 9,
    color: "#374151",
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

interface ModernTemplatePDFProps {
  data: ResumeData;
}

export const ModernTemplatePDF: React.FC<ModernTemplatePDFProps> = ({
  data,
}) => (
  <Document>
    <Page size="A4" style={modernStyles.page}>
      {/* Header */}
      <View style={modernStyles.header}>
        <Text style={modernStyles.name}>{data.personalInfo.fullName}</Text>
        {data.personalInfo.professionalTitle && (
          <Text
            style={[
              modernStyles.contactItem,
              { fontSize: 12, fontStyle: "italic", marginBottom: 4 },
            ]}
          >
            {data.personalInfo.professionalTitle}
          </Text>
        )}
        <View style={modernStyles.contactInfo}>
          <Text style={modernStyles.contactItem}>
            {data.personalInfo.email}
          </Text>
          <Text style={modernStyles.contactItem}>
            {data.personalInfo.phone}
          </Text>
          <Text style={modernStyles.contactItem}>
            {data.personalInfo.location}
          </Text>
        </View>

        {/* Social Links */}
        {(data.personalInfo.linkedin ||
          data.personalInfo.website ||
          data.personalInfo.github ||
          data.personalInfo.twitter ||
          data.personalInfo.portfolio) && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              marginTop: 5,
            }}
          >
            {data.personalInfo.linkedin && (
              <Text style={[modernStyles.contactItem, { fontSize: 9 }]}>
                🔗 {data.personalInfo.linkedin}
              </Text>
            )}
            {data.personalInfo.website && (
              <>
                {data.personalInfo.linkedin && (
                  <Text style={[modernStyles.contactItem, { fontSize: 9 }]}>
                    •
                  </Text>
                )}
                <Text style={[modernStyles.contactItem, { fontSize: 9 }]}>
                  🌐 {data.personalInfo.website}
                </Text>
              </>
            )}
            {data.personalInfo.portfolio && (
              <>
                {(data.personalInfo.linkedin || data.personalInfo.website) && (
                  <Text style={[modernStyles.contactItem, { fontSize: 9 }]}>
                    •
                  </Text>
                )}
                <Text style={[modernStyles.contactItem, { fontSize: 9 }]}>
                  📁 {data.personalInfo.portfolio}
                </Text>
              </>
            )}
            {data.personalInfo.github && (
              <>
                {(data.personalInfo.linkedin ||
                  data.personalInfo.website ||
                  data.personalInfo.portfolio) && (
                  <Text style={[modernStyles.contactItem, { fontSize: 9 }]}>
                    •
                  </Text>
                )}
                <Text style={[modernStyles.contactItem, { fontSize: 9 }]}>
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
                  <Text style={[modernStyles.contactItem, { fontSize: 9 }]}>
                    •
                  </Text>
                )}
                <Text style={[modernStyles.contactItem, { fontSize: 9 }]}>
                  🐦 {data.personalInfo.twitter}
                </Text>
              </>
            )}
          </View>
        )}

        {/* Additional Personal Info */}
        {(data.personalInfo.nationality || data.personalInfo.dateOfBirth) && (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              marginTop: 5,
            }}
          >
            {data.personalInfo.nationality && (
              <Text style={[modernStyles.contactItem, { fontSize: 9 }]}>
                Nationality: {data.personalInfo.nationality}
              </Text>
            )}
            {data.personalInfo.dateOfBirth && (
              <>
                {data.personalInfo.nationality && (
                  <Text style={[modernStyles.contactItem, { fontSize: 9 }]}>
                    •
                  </Text>
                )}
                <Text style={[modernStyles.contactItem, { fontSize: 9 }]}>
                  DOB: {data.personalInfo.dateOfBirth}
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      {/* Career Objective */}
      {data.personalInfo.careerObjective && (
        <View style={modernStyles.section}>
          <Text style={modernStyles.sectionTitle}>Career Objective</Text>
          <Text style={modernStyles.description}>
            {data.personalInfo.careerObjective}
          </Text>
        </View>
      )}

      {/* Professional Summary */}
      {data.personalInfo.summary && (
        <View style={modernStyles.section}>
          <Text style={modernStyles.sectionTitle}>Professional Summary</Text>
          <Text style={modernStyles.description}>
            {data.personalInfo.summary}
          </Text>
        </View>
      )}

      {/* Experience */}
      {data.experience.length > 0 && (
        <View style={modernStyles.section}>
          <Text style={modernStyles.sectionTitle}>EXPERIENCE</Text>
          {data.experience.map((exp) => (
            <View key={exp.id} style={modernStyles.experienceItem}>
              <View style={modernStyles.jobHeader}>
                <View>
                  <Text style={modernStyles.jobTitle}>{exp.jobTitle}</Text>
                  <Text style={modernStyles.company}>{exp.company}</Text>
                </View>
                <View>
                  <Text style={modernStyles.dateLocation}>
                    {exp.startDate} - {exp.current ? "Present" : exp.endDate}
                  </Text>
                  <Text style={modernStyles.dateLocation}>{exp.location}</Text>
                </View>
              </View>
              {exp.description.map((desc, index) => (
                <Text key={index} style={modernStyles.description}>
                  • {desc}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Education */}
      {data.education.length > 0 && (
        <View style={modernStyles.section}>
          <Text style={modernStyles.sectionTitle}>EDUCATION</Text>
          {data.education.map((edu) => (
            <View key={edu.id} style={modernStyles.experienceItem}>
              <View style={modernStyles.jobHeader}>
                <View>
                  <Text style={modernStyles.jobTitle}>{edu.degree}</Text>
                  <Text style={modernStyles.company}>{edu.institution}</Text>
                </View>
                <View>
                  <Text style={modernStyles.dateLocation}>
                    {edu.graduationDate}
                  </Text>
                  <Text style={modernStyles.dateLocation}>{edu.location}</Text>
                </View>
              </View>
              {edu.gpa && (
                <Text style={modernStyles.description}>GPA: {edu.gpa}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Skills */}
      {data.skills.length > 0 && (
        <View style={modernStyles.section}>
          <Text style={modernStyles.sectionTitle}>SKILLS</Text>
          <View style={modernStyles.skillsContainer}>
            {data.skills.map((skill) => (
              <Text key={skill.id} style={modernStyles.skillItem}>
                {skill.name}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* Custom Fields */}
      {data.customFields &&
        data.customFields.filter((f) => f.enabled && f.value).length > 0 && (
          <View style={modernStyles.section}>
            <Text style={modernStyles.sectionTitle}>
              ADDITIONAL INFORMATION
            </Text>
            {data.customFields
              .filter((f) => f.enabled && f.value)
              .map((field) => (
                <View key={field.id} style={{ marginBottom: 5 }}>
                  <Text style={modernStyles.description}>
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
          <View key={section.id} style={modernStyles.section}>
            <Text style={modernStyles.sectionTitle}>
              {section.title.toUpperCase()}
            </Text>
            {section.entries.map((entry) => (
              <View key={entry.id} style={modernStyles.experienceItem}>
                {/* Projects */}
                {section.type === "projects" && (
                  <>
                    <Text style={modernStyles.jobTitle}>
                      {entry.title || entry.name}
                    </Text>
                    {entry.technologies && (
                      <Text style={modernStyles.company}>
                        Technologies: {entry.technologies}
                      </Text>
                    )}
                    {entry.description && (
                      <Text style={modernStyles.description}>
                        {entry.description}
                      </Text>
                    )}
                    {entry.link && (
                      <Text style={[modernStyles.description, { fontSize: 9 }]}>
                        Link: {entry.link}
                      </Text>
                    )}
                  </>
                )}

                {/* Certificates */}
                {section.type === "certificates" && (
                  <>
                    <Text style={modernStyles.jobTitle}>
                      {entry.name || entry.title}
                    </Text>
                    {entry.issuer && (
                      <Text style={modernStyles.company}>
                        Issued by: {entry.issuer}
                      </Text>
                    )}
                    {entry.date && (
                      <Text style={modernStyles.dateLocation}>
                        {entry.date}
                      </Text>
                    )}
                  </>
                )}

                {/* Languages */}
                {section.type === "languages" && (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={modernStyles.description}>
                      {entry.language || entry.name}
                    </Text>
                    {entry.proficiency && (
                      <Text style={modernStyles.description}>
                        {entry.proficiency}
                      </Text>
                    )}
                  </View>
                )}

                {/* Publications */}
                {section.type === "publications" && (
                  <>
                    <Text style={modernStyles.jobTitle}>
                      {entry.title || entry.name}
                    </Text>
                    {entry.authors && (
                      <Text style={modernStyles.company}>
                        Authors: {entry.authors}
                      </Text>
                    )}
                    {entry.publisher && (
                      <Text style={modernStyles.company}>
                        Publisher: {entry.publisher}
                      </Text>
                    )}
                    {entry.description && (
                      <Text style={modernStyles.description}>
                        {entry.description}
                      </Text>
                    )}
                    {entry.link && (
                      <Text style={[modernStyles.description, { fontSize: 9 }]}>
                        Link: {entry.link}
                      </Text>
                    )}
                    {entry.date && (
                      <Text style={modernStyles.dateLocation}>
                        {entry.date}
                      </Text>
                    )}
                  </>
                )}

                {/* Generic rendering for other types */}
                {section.type !== "projects" &&
                  section.type !== "certificates" &&
                  section.type !== "languages" &&
                  section.type !== "publications" && (
                    <>
                      <Text style={modernStyles.jobTitle}>
                        {entry.title || entry.name}
                      </Text>
                      {entry.description && (
                        <Text style={modernStyles.description}>
                          {entry.description}
                        </Text>
                      )}
                      {entry.date && (
                        <Text style={modernStyles.dateLocation}>
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

// Preview component for the template selector
export function ModernTemplatePreview({ data }: ModernTemplatePDFProps) {
  return (
    <div className="w-full h-full bg-white p-6 text-xs overflow-hidden">
      {/* Header */}
      <div className="border-b-2 border-blue-500 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">
          {data.personalInfo.fullName}
        </h1>
        {data.personalInfo.professionalTitle && (
          <p className="text-gray-600 text-sm italic mb-1">
            {data.personalInfo.professionalTitle}
          </p>
        )}
        <div className="flex justify-between text-gray-600 text-xs">
          <span>{data.personalInfo.email}</span>
          <span>{data.personalInfo.phone}</span>
          <span>{data.personalInfo.location}</span>
        </div>

        {/* Social Links */}
        {(data.personalInfo.linkedin ||
          data.personalInfo.website ||
          data.personalInfo.github ||
          data.personalInfo.twitter ||
          data.personalInfo.portfolio) && (
          <div className="flex flex-wrap justify-center gap-3 text-gray-600 text-xs mt-1">
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
          <div className="flex justify-center gap-2 text-gray-600 text-xs mt-1">
            {data.personalInfo.nationality && (
              <span>Nationality: {data.personalInfo.nationality}</span>
            )}
            {data.personalInfo.dateOfBirth && (
              <span>DOB: {data.personalInfo.dateOfBirth}</span>
            )}
          </div>
        )}

        {data.personalInfo.careerObjective && (
          <p className="text-gray-700 text-xs mt-2 leading-relaxed">
            <strong>Career Objective:</strong>{" "}
            {data.personalInfo.careerObjective.substring(0, 100)}...
          </p>
        )}
        {data.personalInfo.summary && (
          <p className="text-gray-700 text-xs mt-2 leading-relaxed">
            {data.personalInfo.summary.substring(0, 150)}...
          </p>
        )}
      </div>

      {/* Experience */}
      {data.experience.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-300 pb-1">
            EXPERIENCE
          </h2>
          {data.experience.slice(0, 2).map((exp) => (
            <div key={exp.id} className="mb-3">
              <div className="flex justify-between items-start mb-1">
                <div>
                  <h3 className="font-bold text-gray-800 text-xs">
                    {exp.jobTitle}
                  </h3>
                  <p className="text-blue-600 text-xs font-medium">
                    {exp.company}
                  </p>
                </div>
                <span className="text-gray-500 text-xs">
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

      <div className="grid grid-cols-2 gap-4">
        {/* Education */}
        {data.education.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-300 pb-1">
              EDUCATION
            </h2>
            {data.education.slice(0, 1).map((edu) => (
              <div key={edu.id} className="mb-2">
                <h3 className="font-bold text-gray-800 text-xs">
                  {edu.degree}
                </h3>
                <p className="text-gray-600 text-xs">{edu.institution}</p>
                <p className="text-gray-500 text-xs">{edu.graduationDate}</p>
                {edu.gpa && (
                  <p className="text-gray-500 text-xs">GPA: {edu.gpa}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-300 pb-1">
              SKILLS
            </h2>
            <div className="flex flex-wrap gap-1">
              {data.skills.slice(0, 6).map((skill) => (
                <span
                  key={skill.id}
                  className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                >
                  {skill.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Custom Fields */}
        {data.customFields &&
          data.customFields.filter((f) => f.enabled && f.value).length > 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-300 pb-1">
                ADDITIONAL INFORMATION
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
              <h2 className="text-sm font-bold text-gray-800 mb-2 border-b border-gray-300 pb-1">
                {section.title.toUpperCase()}
              </h2>
              {section.entries.slice(0, 2).map((entry) => (
                <div key={entry.id} className="mb-2">
                  {section.type === "projects" && (
                    <>
                      <h3 className="font-bold text-gray-800 text-xs">
                        {entry.title || entry.name}
                      </h3>
                      {entry.technologies && (
                        <p className="text-blue-600 text-xs">
                          {entry.technologies}
                        </p>
                      )}
                    </>
                  )}
                  {section.type === "certificates" && (
                    <>
                      <h3 className="font-bold text-gray-800 text-xs">
                        {entry.name || entry.title}
                      </h3>
                      {entry.issuer && (
                        <p className="text-blue-600 text-xs">{entry.issuer}</p>
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
                      <h3 className="font-bold text-gray-800 text-xs">
                        {entry.title || entry.name}
                      </h3>
                      {entry.authors && (
                        <p className="text-blue-600 text-xs">
                          Authors: {entry.authors}
                        </p>
                      )}
                      {entry.publisher && (
                        <p className="text-blue-600 text-xs">
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
                      <h3 className="font-bold text-gray-800 text-xs">
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
