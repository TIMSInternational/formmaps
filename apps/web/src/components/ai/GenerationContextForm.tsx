/**
 * GenerationContextForm Component
 *
 * Form for collecting context and parameters for AI content generation.
 * Adapts fields based on the type of content being generated.
 */

"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { AIFieldType } from "./GenerateButton";

export interface GenerationContextFormProps {
  field: AIFieldType;
  context: Record<string, any>;
  onContextChange: (context: Record<string, any>) => void;
}

export function GenerationContextForm({
  field,
  context,
  onContextChange,
}: GenerationContextFormProps) {
  const { t } = useTranslation();
  const [expandedTip, setExpandedTip] = useState<string | null>(null);

  const formFields: Record<
    string,
    Array<{
      name: string;
      label: string;
      type: string;
      required?: boolean;
      placeholder?: string;
      tooltip?: string;
    }>
  > = {
    summary: [
      {
        name: "current_role",
        label: t("ai.form.summary.currentRole.label", "Current Role"),
        type: "text",
        placeholder: t("ai.form.summary.currentRole.placeholder", "e.g., Senior Software Engineer"),
        tooltip: t("ai.form.summary.currentRole.tooltip", "Your current job title or primary role"),
      },
      {
        name: "key_skills",
        label: t("ai.form.summary.keySkills.label", "Key Skills"),
        type: "text",
        placeholder: t("ai.form.summary.keySkills.placeholder", "e.g., React, Node.js, TypeScript, AWS"),
        tooltip: t("ai.form.summary.keySkills.tooltip", "Comma-separated list of your main skills"),
      },
      {
        name: "years_experience",
        label: t("ai.form.summary.yearsExperience.label", "Years of Experience"),
        type: "number",
        placeholder: t("ai.form.summary.yearsExperience.placeholder", "e.g., 8"),
        tooltip: t("ai.form.summary.yearsExperience.tooltip", "Total years in your field"),
      },
      {
        name: "achievements",
        label: t("ai.form.summary.achievements.label", "Key Achievements (Optional)"),
        type: "textarea",
        placeholder:
          t("ai.form.summary.achievements.placeholder", "e.g., Led team of 5 engineers, increased performance by 40%"),
        tooltip: t("ai.form.summary.achievements.tooltip", "Major accomplishments or projects you're proud of"),
      },
      {
        name: "tone",
        label: t("ai.form.common.tone.label", "Tone"),
        type: "select",
        tooltip: t("ai.form.common.tone.tooltip", "Choose how formal or casual the summary should be"),
      },
    ],
    objective: [
      {
        name: "target_role",
        label: t("ai.form.objective.targetRole.label", "Target Role"),
        type: "text",
        required: true,
        placeholder: t("ai.form.objective.targetRole.placeholder", "e.g., Product Manager"),
        tooltip: t("ai.form.objective.targetRole.tooltip", "The position you're applying for"),
      },
      {
        name: "industry",
        label: t("ai.form.objective.industry.label", "Industry"),
        type: "text",
        placeholder: t("ai.form.objective.industry.placeholder", "e.g., FinTech, SaaS, Healthcare"),
        tooltip: t("ai.form.objective.industry.tooltip", "Industry or sector for the target role"),
      },
      {
        name: "key_strengths",
        label: t("ai.form.objective.keyStrengths.label", "Key Strengths"),
        type: "textarea",
        required: true,
        placeholder: t("ai.form.objective.keyStrengths.placeholder", "e.g., Strategic thinking, team leadership, data analysis"),
        tooltip: t("ai.form.objective.keyStrengths.tooltip", "Your main strengths for this role"),
      },
      {
        name: "tone",
        label: t("ai.form.common.tone.label", "Tone"),
        type: "select",
        tooltip: t("ai.form.common.tone.tooltip", "Professional, Enthusiastic, or Confident"),
      },
    ],
    bullets: [
      {
        name: "job_title",
        label: t("ai.form.bullets.jobTitle.label", "Job Title"),
        type: "text",
        required: true,
        placeholder: t("ai.form.bullets.jobTitle.placeholder", "e.g., Backend Developer"),
        tooltip: t("ai.form.bullets.jobTitle.tooltip", "Your role/title at this position"),
      },
      {
        name: "responsibilities",
        label: t("ai.form.bullets.responsibilities.label", "Main Responsibilities"),
        type: "textarea",
        required: true,
        placeholder:
          t("ai.form.bullets.responsibilities.placeholder", "What did you do? e.g., Developed REST APIs, managed database migrations"),
        tooltip: t("ai.form.bullets.responsibilities.tooltip", "Key tasks and responsibilities in this role"),
      },
      {
        name: "metrics",
        label: t("ai.form.bullets.metrics.label", "Metrics/Results (Optional)"),
        type: "textarea",
        placeholder: t("ai.form.bullets.metrics.placeholder", "e.g., 40% performance improvement, 99.9% uptime"),
        tooltip: t("ai.form.bullets.metrics.tooltip", "Quantifiable results from your work"),
      },
      {
        name: "technologies",
        label: t("ai.form.bullets.technologies.label", "Technologies Used"),
        type: "text",
        placeholder: t("ai.form.bullets.technologies.placeholder", "e.g., React, Python, PostgreSQL, Docker"),
        tooltip: t("ai.form.bullets.technologies.tooltip", "Tools and technologies you used"),
      },
    ],
    project: [
      {
        name: "project_name",
        label: t("ai.form.project.projectName.label", "Project Name"),
        type: "text",
        required: true,
        placeholder: t("ai.form.project.projectName.placeholder", "e.g., E-commerce Platform"),
        tooltip: t("ai.form.project.projectName.tooltip", "Name of the project"),
      },
      {
        name: "project_description",
        label: t("ai.form.project.projectDescription.label", "Project Description"),
        type: "textarea",
        required: true,
        placeholder: t("ai.form.project.projectDescription.placeholder", "Brief overview of what the project does"),
        tooltip: t("ai.form.project.projectDescription.tooltip", "What was the project about?"),
      },
      {
        name: "your_role",
        label: t("ai.form.project.yourRole.label", "Your Role"),
        type: "text",
        placeholder: t("ai.form.project.yourRole.placeholder", "e.g., Lead Developer, Frontend Engineer"),
        tooltip: t("ai.form.project.yourRole.tooltip", "What was your role in the project?"),
      },
      {
        name: "impact",
        label: t("ai.form.project.impact.label", "Impact/Results (Optional)"),
        type: "textarea",
        placeholder: t("ai.form.project.impact.placeholder", "e.g., Used by 10,000+ users, 50% faster than competitors"),
        tooltip: t("ai.form.project.impact.tooltip", "Results or impact of the project"),
      },
    ],
    skill: [
      {
        name: "skill_name",
        label: t("ai.form.skill.skillName.label", "Skill Name"),
        type: "text",
        required: true,
        placeholder: t("ai.form.skill.skillName.placeholder", "e.g., React, Project Management, Data Analysis"),
        tooltip: t("ai.form.skill.skillName.tooltip", "The skill you want to describe"),
      },
      {
        name: "proficiency_level",
        label: t("ai.form.skill.proficiencyLevel.label", "Proficiency Level"),
        type: "select",
        tooltip: t("ai.form.skill.proficiencyLevel.tooltip", "Your level of expertise in this skill"),
      },
      {
        name: "experience_examples",
        label: t("ai.form.skill.experienceExamples.label", "Experience Examples"),
        type: "textarea",
        placeholder: t("ai.form.skill.experienceExamples.placeholder", "e.g., Built 5+ production apps, managed 50+ projects"),
        tooltip: t("ai.form.skill.experienceExamples.tooltip", "Examples of how you've used this skill"),
      },
    ],
    experience_description: [
      {
        name: "job_title",
        label: t("ai.form.experience.jobTitle.label", "Job Title"),
        type: "text",
        required: true,
        placeholder: t("ai.form.experience.jobTitle.placeholder", "e.g., Senior Software Engineer"),
        tooltip: t("ai.form.experience.jobTitle.tooltip", "Your role/title at this position"),
      },
      {
        name: "company",
        label: t("ai.form.experience.company.label", "Company"),
        type: "text",
        placeholder: t("ai.form.experience.company.placeholder", "e.g., Google"),
        tooltip: t("ai.form.experience.company.tooltip", "Company name"),
      },
      {
        name: "responsibilities",
        label: t("ai.form.experience.responsibilities.label", "Main Responsibilities"),
        type: "textarea",
        required: true,
        placeholder:
          t("ai.form.experience.responsibilities.placeholder", "What did you do? e.g., Developed REST APIs, managed database migrations"),
        tooltip: t("ai.form.experience.responsibilities.tooltip", "Key tasks and responsibilities in this role"),
      },
      {
        name: "achievements",
        label: t("ai.form.experience.achievements.label", "Key Achievements"),
        type: "textarea",
        placeholder: t("ai.form.experience.achievements.placeholder", "e.g., 40% performance improvement, 99.9% uptime"),
        tooltip: t("ai.form.experience.achievements.tooltip", "Quantifiable results from your work"),
      },
      {
        name: "technologies",
        label: t("ai.form.experience.technologies.label", "Technologies/Skills Used"),
        type: "text",
        placeholder: t("ai.form.experience.technologies.placeholder", "e.g., React, Node.js, AWS, PostgreSQL"),
        tooltip: t("ai.form.experience.technologies.tooltip", "Technologies and skills you used in this role"),
      },
    ],
    experience_bullets: [
      {
        name: "job_title",
        label: t("ai.form.experience.jobTitle.label", "Job Title"),
        type: "text",
        required: true,
        placeholder: t("ai.form.experience.jobTitle.placeholder", "e.g., Backend Developer"),
        tooltip: t("ai.form.experience.jobTitle.tooltip", "Your role/title at this position"),
      },
      {
        name: "company",
        label: t("ai.form.experience.company.label", "Company"),
        type: "text",
        placeholder: t("ai.form.experience.company.placeholder", "e.g., Microsoft"),
        tooltip: t("ai.form.experience.company.tooltip", "Company name"),
      },
      {
        name: "responsibilities",
        label: t("ai.form.experience.responsibilities.label", "Main Responsibilities"),
        type: "textarea",
        required: true,
        placeholder:
          t("ai.form.experience.responsibilities.placeholder", "What did you do? e.g., Developed REST APIs, managed database migrations"),
        tooltip: t("ai.form.experience.responsibilities.tooltip", "Key tasks and responsibilities in this role"),
      },
      {
        name: "achievements",
        label: t("ai.form.experience.metrics.label", "Metrics/Results"),
        type: "textarea",
        placeholder: t("ai.form.experience.metrics.placeholder", "e.g., 40% performance improvement, 99.9% uptime"),
        tooltip: t("ai.form.experience.metrics.tooltip", "Quantifiable results from your work"),
      },
      {
        name: "technologies",
        label: t("ai.form.experience.technologies.label", "Technologies/Skills Used"),
        type: "text",
        placeholder: t("ai.form.experience.technologies.placeholder", "e.g., Python, Django, Docker, Kubernetes"),
        tooltip: t("ai.form.experience.technologies.tooltip", "Technologies and skills you used in this role"),
      },
    ],
    education_description: [
      {
        name: "degree",
        label: t("ai.form.education.degree.label", "Degree"),
        type: "text",
        required: true,
        placeholder: t("ai.form.education.degree.placeholder", "e.g., Bachelor of Science in Computer Science"),
        tooltip: t("ai.form.education.degree.tooltip", "Your degree or qualification"),
      },
      {
        name: "institution",
        label: t("ai.form.education.institution.label", "Institution"),
        type: "text",
        required: true,
        placeholder: t("ai.form.education.institution.placeholder", "e.g., Stanford University"),
        tooltip: t("ai.form.education.institution.tooltip", "Name of the educational institution"),
      },
      {
        name: "field_of_study",
        label: t("ai.form.education.fieldOfStudy.label", "Field of Study"),
        type: "text",
        placeholder: t("ai.form.education.fieldOfStudy.placeholder", "e.g., Computer Science"),
        tooltip: t("ai.form.education.fieldOfStudy.tooltip", "Your major or field of study"),
      },
      {
        name: "achievements",
        label: t("ai.form.education.achievements.label", "Achievements/Honors"),
        type: "textarea",
        placeholder: t("ai.form.education.achievements.placeholder", "e.g., Dean's List, GPA 3.8/4.0, Summa Cum Laude"),
        tooltip: t("ai.form.education.achievements.tooltip", "Academic achievements, honors, or awards"),
      },
      {
        name: "coursework",
        label: t("ai.form.education.coursework.label", "Relevant Coursework"),
        type: "textarea",
        placeholder:
          t("ai.form.education.coursework.placeholder", "e.g., Data Structures, Algorithms, Machine Learning, Database Systems"),
        tooltip: t("ai.form.education.coursework.tooltip", "Relevant courses you took"),
      },
    ],
    project_description: [
      {
        name: "project_name",
        label: t("ai.form.project.projectName.label", "Project Name"),
        type: "text",
        required: true,
        placeholder: t("ai.form.project.projectName.placeholder", "e.g., E-commerce Platform"),
        tooltip: t("ai.form.project.projectName.tooltip", "Name of the project"),
      },
      {
        name: "technologies",
        label: t("ai.form.project.technologies.label", "Technologies Used"),
        type: "text",
        required: true,
        placeholder: t("ai.form.project.technologies.placeholder", "e.g., React, Node.js, MongoDB, AWS"),
        tooltip: t("ai.form.project.technologies.tooltip", "Technologies and tools used in the project"),
      },
      {
        name: "role",
        label: t("ai.form.project.role.label", "Your Role"),
        type: "text",
        placeholder: t("ai.form.project.role.placeholder", "e.g., Full Stack Developer, Team Lead"),
        tooltip: t("ai.form.project.role.tooltip", "Your role in the project"),
      },
      {
        name: "description",
        label: t("ai.form.project.description.label", "Project Description"),
        type: "textarea",
        placeholder: t("ai.form.project.description.placeholder", "What was the project about?"),
        tooltip: t("ai.form.project.description.tooltip", "Brief description of the project"),
      },
      {
        name: "impact",
        label: t("ai.form.project.impact.label", "Impact/Results"),
        type: "textarea",
        placeholder: t("ai.form.project.impact.placeholder", "e.g., Increased sales by 30%, Reduced load time by 50%"),
        tooltip: t("ai.form.project.impact.tooltip", "Measurable impact or results"),
      },
    ],
    project_bullets: [
      {
        name: "project_name",
        label: t("ai.form.project.projectName.label", "Project Name"),
        type: "text",
        required: true,
        placeholder: t("ai.form.project.projectName.placeholder", "e.g., Mobile Banking App"),
        tooltip: t("ai.form.project.projectName.tooltip", "Name of the project"),
      },
      {
        name: "technologies",
        label: t("ai.form.project.technologies.label", "Technologies Used"),
        type: "text",
        required: true,
        placeholder: t("ai.form.project.technologies.placeholder", "e.g., React Native, Firebase, Redux"),
        tooltip: t("ai.form.project.technologies.tooltip", "Technologies and tools used in the project"),
      },
      {
        name: "role",
        label: t("ai.form.project.role.label", "Your Role"),
        type: "text",
        placeholder: t("ai.form.project.role.placeholder", "e.g., Mobile Developer"),
        tooltip: t("ai.form.project.role.tooltip", "Your role in the project"),
      },
      {
        name: "description",
        label: t("ai.form.project.description.label", "Project Description"),
        type: "textarea",
        placeholder: t("ai.form.project.description.placeholder", "What was the project about?"),
        tooltip: t("ai.form.project.description.tooltip", "Brief description of the project"),
      },
      {
        name: "impact",
        label: t("ai.form.project.impact.label", "Impact/Results"),
        type: "textarea",
        placeholder: t("ai.form.project.impact.placeholder", "e.g., 10K+ downloads, 4.5 star rating"),
        tooltip: t("ai.form.project.impact.tooltip", "Measurable impact or results"),
      },
    ],
    course_description: [
      {
        name: "course_name",
        label: t("ai.form.course.courseName.label", "Course Name"),
        type: "text",
        required: true,
        placeholder: t("ai.form.course.courseName.placeholder", "e.g., AWS Certified Solutions Architect"),
        tooltip: t("ai.form.course.courseName.tooltip", "Name of the course or certification"),
      },
      {
        name: "provider",
        label: t("ai.form.course.provider.label", "Provider/Institution"),
        type: "text",
        placeholder: t("ai.form.course.provider.placeholder", "e.g., Amazon Web Services, Coursera"),
        tooltip: t("ai.form.course.provider.tooltip", "Who provided the course or certification"),
      },
      {
        name: "skills_learned",
        label: t("ai.form.course.skillsLearned.label", "Skills Learned"),
        type: "textarea",
        placeholder: t("ai.form.course.skillsLearned.placeholder", "e.g., Cloud architecture, EC2, S3, Lambda"),
        tooltip: t("ai.form.course.skillsLearned.tooltip", "Key skills or knowledge gained"),
      },
      {
        name: "projects",
        label: t("ai.form.course.projects.label", "Projects/Assignments"),
        type: "textarea",
        placeholder: t("ai.form.course.projects.placeholder", "e.g., Built scalable web application on AWS"),
        tooltip: t("ai.form.course.projects.tooltip", "Notable projects or assignments completed"),
      },
    ],
    award_description: [
      {
        name: "award_name",
        label: t("ai.form.award.awardName.label", "Award Name"),
        type: "text",
        required: true,
        placeholder: t("ai.form.award.awardName.placeholder", "e.g., Employee of the Year"),
        tooltip: t("ai.form.award.awardName.tooltip", "Name of the award or achievement"),
      },
      {
        name: "organization",
        label: t("ai.form.award.organization.label", "Issuing Organization"),
        type: "text",
        placeholder: t("ai.form.award.organization.placeholder", "e.g., TechCorp Inc."),
        tooltip: t("ai.form.award.organization.tooltip", "Organization that issued the award"),
      },
      {
        name: "reason",
        label: t("ai.form.award.reason.label", "Reason for Award"),
        type: "textarea",
        placeholder: t("ai.form.award.reason.placeholder", "e.g., Outstanding performance in Q4 2023"),
        tooltip: t("ai.form.award.reason.tooltip", "Why you received this award"),
      },
      {
        name: "impact",
        label: t("ai.form.award.impact.label", "Impact/Significance"),
        type: "textarea",
        placeholder: t("ai.form.award.impact.placeholder", "e.g., Recognized among 500+ employees"),
        tooltip: t("ai.form.award.impact.tooltip", "The significance or impact of this award"),
      },
    ],
    organization_description: [
      {
        name: "organization_name",
        label: t("ai.form.organization.organizationName.label", "Organization Name"),
        type: "text",
        required: true,
        placeholder: t("ai.form.organization.organizationName.placeholder", "e.g., IEEE Computer Society"),
        tooltip: t("ai.form.organization.organizationName.tooltip", "Name of the organization"),
      },
      {
        name: "role",
        label: t("ai.form.organization.role.label", "Your Role"),
        type: "text",
        placeholder: t("ai.form.organization.role.placeholder", "e.g., Member, Vice President"),
        tooltip: t("ai.form.organization.role.tooltip", "Your role in the organization"),
      },
      {
        name: "activities",
        label: t("ai.form.organization.activities.label", "Activities/Responsibilities"),
        type: "textarea",
        placeholder: t("ai.form.organization.activities.placeholder", "e.g., Organized tech talks, mentored students"),
        tooltip: t("ai.form.organization.activities.tooltip", "What you did in this organization"),
      },
      {
        name: "achievements",
        label: t("ai.form.organization.achievements.label", "Achievements"),
        type: "textarea",
        placeholder: t("ai.form.organization.achievements.placeholder", "e.g., Increased membership by 30%"),
        tooltip: t("ai.form.organization.achievements.tooltip", "Notable achievements in this role"),
      },
    ],
    publication_description: [
      {
        name: "title",
        label: t("ai.form.publication.title.label", "Publication Title"),
        type: "text",
        required: true,
        placeholder: t("ai.form.publication.title.placeholder", "e.g., Machine Learning in Healthcare"),
        tooltip: t("ai.form.publication.title.tooltip", "Title of the publication"),
      },
      {
        name: "publisher",
        label: t("ai.form.publication.publisher.label", "Publisher/Journal"),
        type: "text",
        placeholder: t("ai.form.publication.publisher.placeholder", "e.g., IEEE Transactions, Medium"),
        tooltip: t("ai.form.publication.publisher.tooltip", "Where it was published"),
      },
      {
        name: "topic",
        label: t("ai.form.publication.topic.label", "Topic/Subject"),
        type: "textarea",
        placeholder: t("ai.form.publication.topic.placeholder", "e.g., Application of ML algorithms in diagnosis"),
        tooltip: t("ai.form.publication.topic.tooltip", "What the publication is about"),
      },
      {
        name: "impact",
        label: t("ai.form.publication.impact.label", "Impact/Citations"),
        type: "textarea",
        placeholder: t("ai.form.publication.impact.placeholder", "e.g., 50+ citations, Featured in top journal"),
        tooltip: t("ai.form.publication.impact.tooltip", "Impact or recognition of the publication"),
      },
    ],
    language_description: [
      {
        name: "language",
        label: t("ai.form.language.language.label", "Language"),
        type: "text",
        required: true,
        placeholder: t("ai.form.language.language.placeholder", "e.g., Spanish"),
        tooltip: t("ai.form.language.language.tooltip", "The language"),
      },
      {
        name: "proficiency",
        label: t("ai.form.language.proficiency.label", "Proficiency Level"),
        type: "text",
        placeholder: t("ai.form.language.proficiency.placeholder", "e.g., Native, Fluent, Intermediate"),
        tooltip: t("ai.form.language.proficiency.tooltip", "Your proficiency level"),
      },
      {
        name: "context",
        label: t("ai.form.language.context.label", "Context/Usage"),
        type: "textarea",
        placeholder: t("ai.form.language.context.placeholder", "e.g., Used in business meetings, customer support"),
        tooltip: t("ai.form.language.context.tooltip", "How you use this language"),
      },
    ],
    volunteer_description: [
      {
        name: "organization",
        label: t("ai.form.volunteer.organization.label", "Organization"),
        type: "text",
        required: true,
        placeholder: t("ai.form.volunteer.organization.placeholder", "e.g., Red Cross, Local Food Bank"),
        tooltip: t("ai.form.volunteer.organization.tooltip", "Organization where you volunteered"),
      },
      {
        name: "role",
        label: t("ai.form.volunteer.role.label", "Your Role"),
        type: "text",
        placeholder: t("ai.form.volunteer.role.placeholder", "e.g., Volunteer Coordinator"),
        tooltip: t("ai.form.volunteer.role.tooltip", "Your role in the volunteer work"),
      },
      {
        name: "activities",
        label: t("ai.form.volunteer.activities.label", "Activities"),
        type: "textarea",
        required: true,
        placeholder: t("ai.form.volunteer.activities.placeholder", "e.g., Organized food drives, coordinated volunteers"),
        tooltip: t("ai.form.volunteer.activities.tooltip", "What you did as a volunteer"),
      },
      {
        name: "impact",
        label: t("ai.form.volunteer.impact.label", "Impact"),
        type: "textarea",
        placeholder: t("ai.form.volunteer.impact.placeholder", "e.g., Served 500+ families, raised $10K"),
        tooltip: t("ai.form.volunteer.impact.tooltip", "The impact of your volunteer work"),
      },
    ],
    reference_description: [
      {
        name: "name",
        label: t("ai.form.reference.name.label", "Reference Name"),
        type: "text",
        required: true,
        placeholder: t("ai.form.reference.name.placeholder", "e.g., John Smith"),
        tooltip: t("ai.form.reference.name.tooltip", "Name of the reference"),
      },
      {
        name: "relationship",
        label: t("ai.form.reference.relationship.label", "Relationship"),
        type: "text",
        placeholder: t("ai.form.reference.relationship.placeholder", "e.g., Former Manager, Professor"),
        tooltip: t("ai.form.reference.relationship.tooltip", "Your relationship with this person"),
      },
      {
        name: "context",
        label: t("ai.form.reference.context.label", "Context"),
        type: "textarea",
        placeholder: t("ai.form.reference.context.placeholder", "e.g., Worked together at TechCorp for 3 years"),
        tooltip: t("ai.form.reference.context.tooltip", "Context of your relationship"),
      },
    ],
    declaration_text: [
      {
        name: "name",
        label: t("ai.form.declaration.name.label", "Your Full Name"),
        type: "text",
        required: true,
        placeholder: t("ai.form.declaration.name.placeholder", "e.g., John Doe"),
        tooltip: t("ai.form.declaration.name.tooltip", "Your full legal name"),
      },
      {
        name: "location",
        label: t("ai.form.declaration.location.label", "Location"),
        type: "text",
        placeholder: t("ai.form.declaration.location.placeholder", "e.g., New York, USA"),
        tooltip: t("ai.form.declaration.location.tooltip", "Your current location"),
      },
    ],
    custom_description: [
      {
        name: "section_title",
        label: t("ai.form.custom.sectionTitle.label", "Section Title"),
        type: "text",
        required: true,
        placeholder: t("ai.form.custom.sectionTitle.placeholder", "e.g., Hobbies, Additional Information"),
        tooltip: t("ai.form.custom.sectionTitle.tooltip", "Title of your custom section"),
      },
      {
        name: "context",
        label: t("ai.form.custom.context.label", "Context/Purpose"),
        type: "textarea",
        required: true,
        placeholder: t("ai.form.custom.context.placeholder", "e.g., Personal interests, additional skills"),
        tooltip: t("ai.form.custom.context.tooltip", "What this section is about"),
      },
      {
        name: "key_points",
        label: t("ai.form.custom.keyPoints.label", "Key Points"),
        type: "textarea",
        placeholder: t("ai.form.custom.keyPoints.placeholder", "e.g., Photography, hiking, open source contributions"),
        tooltip: t("ai.form.custom.keyPoints.tooltip", "Main points to include"),
      },
    ],
    custom_bullets: [
      {
        name: "section_title",
        label: t("ai.form.custom.sectionTitle.label", "Section Title"),
        type: "text",
        required: true,
        placeholder: t("ai.form.custom.sectionTitle.placeholder", "e.g., Technical Skills, Certifications"),
        tooltip: t("ai.form.custom.sectionTitle.tooltip", "Title of your custom section"),
      },
      {
        name: "context",
        label: t("ai.form.custom.context.label", "Context/Purpose"),
        type: "textarea",
        required: true,
        placeholder: t("ai.form.custom.context.placeholder", "e.g., Additional technical skills not listed elsewhere"),
        tooltip: t("ai.form.custom.context.tooltip", "What this section is about"),
      },
      {
        name: "key_points",
        label: t("ai.form.custom.keyPoints.label", "Key Points"),
        type: "textarea",
        placeholder: t("ai.form.custom.keyPoints.placeholder", "e.g., Docker, Kubernetes, CI/CD, Microservices"),
        tooltip: t("ai.form.custom.keyPoints.tooltip", "Main points to include as bullets"),
      },
    ],
  };

  const toneOptions = [
    t("ai.tone.professional", "Professional"),
    t("ai.tone.enthusiastic", "Enthusiastic"),
    t("ai.tone.confident", "Confident"),
    t("ai.tone.analytical", "Analytical"),
    t("ai.tone.creative", "Creative"),
  ];
  const proficiencyOptions = [
    t("ai.proficiency.beginner", "Beginner"),
    t("ai.proficiency.intermediate", "Intermediate"),
    t("ai.proficiency.advanced", "Advanced"),
    t("ai.proficiency.expert", "Expert")
  ];

  const fields = formFields[field] || [];

  const handleFieldChange = (fieldName: string, value: any) => {
    onContextChange({
      ...context,
      [fieldName]: value,
    });
  };

  const renderField = (fieldConfig: any) => {
    const value = context[fieldConfig.name] || "";

    switch (fieldConfig.type) {
      case "text":
        return (
          <input
            id={fieldConfig.name}
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(fieldConfig.name, e.target.value)}
            placeholder={fieldConfig.placeholder}
            className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label={fieldConfig.label}
          />
        );

      case "number":
        return (
          <input
            id={fieldConfig.name}
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(fieldConfig.name, e.target.value)}
            placeholder={fieldConfig.placeholder}
            className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label={fieldConfig.label}
          />
        );

      case "textarea":
        return (
          <textarea
            id={fieldConfig.name}
            value={value}
            onChange={(e) => handleFieldChange(fieldConfig.name, e.target.value)}
            placeholder={fieldConfig.placeholder}
            rows={3}
            className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            aria-label={fieldConfig.label}
          />
        );

      case "select":
        const options =
          fieldConfig.name === "tone"
            ? toneOptions
            : fieldConfig.name === "proficiency_level"
            ? proficiencyOptions
            : [];

        return (
          <div className="relative">
            <select
              id={fieldConfig.name}
              value={value}
              onChange={(e) => handleFieldChange(fieldConfig.name, e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
              aria-label={fieldConfig.label}
            >
              <option value="">{t("common.selectOption", "Select an option")}</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-900">
          <strong>💡 {t("ai.form.tipLabel", "Tip")}:</strong> {t("ai.form.tipMessage", "The more details you provide, the better the generated content will be.")}
        </p>
      </div>

      {fields.map((fieldConfig) => (
        <div key={fieldConfig.name} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label
              htmlFor={fieldConfig.name}
              className="text-sm font-medium text-foreground"
            >
              {fieldConfig.label}
              {fieldConfig.required && (
                <span className="text-destructive">*</span>
              )}
            </label>
            {fieldConfig.tooltip && (
              <button
                type="button"
                onClick={() =>
                  setExpandedTip(
                    expandedTip === fieldConfig.name ? null : fieldConfig.name
                  )
                }
                className="p-0.5 hover:bg-accent rounded transition-colors"
                title={fieldConfig.tooltip}
                aria-label={t("common.toggleTooltip", "Toggle tooltip")}
                aria-expanded={expandedTip === fieldConfig.name}
              >
                <Info className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              </button>
            )}
          </div>

          {expandedTip === fieldConfig.name && (
            <div className="px-2 py-1 text-xs text-muted-foreground bg-muted rounded" role="tooltip">
              {fieldConfig.tooltip}
            </div>
          )}

          {renderField(fieldConfig)}
        </div>
      ))}
    </div>
  );
}
