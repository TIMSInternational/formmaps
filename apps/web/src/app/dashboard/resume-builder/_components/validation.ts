import { ResumeData } from '@/store/useGlobalStore';

export interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
  completionPercentage: number;
}

export interface StepValidation {
  [stepId: number]: ValidationResult;
}

// Required fields for each step
const requiredFields = {
  1: { // Career Field
    required: ['careerField'],
    optional: []
  },
  2: { // Template Selection
    required: ['template'],
    optional: []
  },
  3: { // Personal Information
    required: ['fullName', 'email', 'phone'],
    optional: ['location', 'linkedin', 'website', 'summary']
  },
  4: { // Work Experience - Optional for freshers
    required: [],
    optional: ['experience'],
    minItems: 0
  },
  5: { // Education
    required: ['education'],
    minItems: 1
  },
  6: { // Skills
    required: ['skills'],
    minItems: 3
  },
  7: { // Summary - Review step
    required: [],
    optional: []
  }
};

export function validateCareerField(careerField: string): ValidationResult {
  const missing: string[] = [];

  if (!careerField || careerField.trim() === '') {
    missing.push('career field');
  }

  return {
    isValid: missing.length === 0,
    missingFields: missing,
    completionPercentage: careerField ? 100 : 0
  };
}

export function validateTemplate(template: string): ValidationResult {
  const missing: string[] = [];

  if (!template || template.trim() === '') {
    missing.push('template selection');
  }

  return {
    isValid: missing.length === 0,
    missingFields: missing,
    completionPercentage: template ? 100 : 0
  };
}

export function validatePersonalInfo(personalInfo: any): ValidationResult {
  const missing: string[] = [];
  const required = requiredFields[3].required; // Fixed: Use step 3 (Personal Info) instead of step 2 (Template)

  required.forEach(field => {
    if (!personalInfo[field] || personalInfo[field].trim() === '') {
      missing.push(field);
    }
  });

  // Email validation
  if (personalInfo.email && !isValidEmail(personalInfo.email)) {
    missing.push('valid email');
  }

  const totalFields = required.length + requiredFields[3].optional.length; // Fixed: Use step 3
  const filledFields = Object.keys(personalInfo).filter(key =>
    personalInfo[key] && personalInfo[key].toString().trim() !== ''
  ).length;

  return {
    isValid: missing.length === 0,
    missingFields: missing,
    completionPercentage: Math.min(100, (filledFields / totalFields) * 100)
  };
}

export function validateExperience(experience: any[]): ValidationResult {
  const missing: string[] = [];

  // Experience is now optional - no minimum required
  if (experience && experience.length > 0) {
    // Check if each experience has required fields
    experience.forEach((exp, index) => {
      if (!exp.jobTitle || exp.jobTitle.trim() === '') {
        missing.push(`job title for experience ${index + 1}`);
      }
      if (!exp.company || exp.company.trim() === '') {
        missing.push(`company for experience ${index + 1}`);
      }
      if (!exp.startDate || exp.startDate.trim() === '') {
        missing.push(`start date for experience ${index + 1}`);
      }
      if (!exp.description || exp.description.length === 0) {
        missing.push(`description for experience ${index + 1}`);
      }
    });
  }

  // Always 100% if no experience (it's optional) or if all existing experiences are valid
  const completionPercentage = (!experience || experience.length === 0) ? 100 :
    (missing.length === 0 ? 100 : 50);

  return {
    isValid: missing.length === 0, // Valid if no missing fields in existing experiences
    missingFields: missing,
    completionPercentage
  };
}

export function validateEducation(education: any[]): ValidationResult {
  const missing: string[] = [];
  
  if (!education || education.length === 0) {
    missing.push('at least one education entry');
  } else {
    education.forEach((edu, index) => {
      if (!edu.degree || edu.degree.trim() === '') {
        missing.push(`degree for education ${index + 1}`);
      }
      if (!edu.institution || edu.institution.trim() === '') {
        missing.push(`institution for education ${index + 1}`);
      }
      if (!edu.graduationDate || edu.graduationDate.trim() === '') {
        missing.push(`graduation date for education ${index + 1}`);
      }
    });
  }

  const completionPercentage = education.length >= requiredFields[4].minItems ? 100 :
    (education.length / requiredFields[4].minItems) * 100;

  return {
    isValid: missing.length === 0 && education.length >= requiredFields[4].minItems,
    missingFields: missing,
    completionPercentage
  };
}

export function validateSkills(skills: any[]): ValidationResult {
  const missing: string[] = [];
  
  if (!skills || skills.length < requiredFields[5].minItems) {
    missing.push(`at least ${requiredFields[5].minItems} skills`);
  }

  const completionPercentage = skills.length >= requiredFields[5].minItems ? 100 :
    (skills.length / requiredFields[5].minItems) * 100;

  return {
    isValid: skills.length >= requiredFields[5].minItems,
    missingFields: missing,
    completionPercentage
  };
}

export function validateAllSteps(data: ResumeData): StepValidation {
  return {
    1: validateCareerField(data.careerField),
    2: validateTemplate(data.template),
    3: validatePersonalInfo(data.personalInfo),
    4: validateExperience(data.experience),
    5: validateEducation(data.education),
    6: validateSkills(data.skills),
    7: { isValid: true, missingFields: [], completionPercentage: 100 } // Summary step
  };
}

export function getOverallProgress(validation: StepValidation): number {
  const steps = Object.keys(validation).length;
  const totalPercentage = Object.values(validation).reduce(
    (sum, step) => sum + step.completionPercentage, 0
  );
  return totalPercentage / steps;
}

// Helper functions
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function getStepStatus(stepId: number, validation: ValidationResult) {
  if (validation.isValid) return 'complete';
  if (validation.completionPercentage > 0) return 'partial';
  return 'empty';
}
