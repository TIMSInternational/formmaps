import { 
  EvaluationSession, 
  Evaluator, 
  EvaluationResponse, 
  CompetencyDimension,
  EvaluatorGroup
} from '@/services/evaluationService';

// Validation result interfaces
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

// Validation rule types
export type ValidationRule<T> = (data: T) => ValidationError[];

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone validation regex (international format)
const PHONE_REGEX = /^[\+]?[1-9][\d]{0,3}[\s\-\(\)]*[\d\s\-\(\)]{7,15}$/;

// Name validation regex (letters, spaces, hyphens, apostrophes)
const NAME_REGEX = /^[a-zA-Z\s\-\']{2,50}$/;

/**
 * Validates evaluator data
 */
export const validateEvaluator = (evaluator: Partial<Evaluator>): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Required fields validation
  if (!evaluator.name || evaluator.name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Evaluator name is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  } else if (!NAME_REGEX.test(evaluator.name.trim())) {
    errors.push({
      field: 'name',
      message: 'Name must contain only letters, spaces, hyphens, and apostrophes (2-50 characters)',
      code: 'INVALID_FORMAT',
      severity: 'error'
    });
  }

  if (!evaluator.email || evaluator.email.trim().length === 0) {
    errors.push({
      field: 'email',
      message: 'Email address is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  } else if (!EMAIL_REGEX.test(evaluator.email.trim())) {
    errors.push({
      field: 'email',
      message: 'Please enter a valid email address',
      code: 'INVALID_EMAIL',
      severity: 'error'
    });
  }

  if (!evaluator.groupType) {
    errors.push({
      field: 'groupType',
      message: 'Evaluator group is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  } else if (!['self', 'parent', 'teacher', 'peer'].includes(evaluator.groupType)) {
    errors.push({
      field: 'groupType',
      message: 'Invalid evaluator group. Must be one of: self, parent, teacher, peer',
      code: 'INVALID_VALUE',
      severity: 'error'
    });
  }

  // Optional phone validation
  if (evaluator.phone && evaluator.phone.trim().length > 0) {
    if (!PHONE_REGEX.test(evaluator.phone.trim())) {
      warnings.push({
        field: 'phone',
        message: 'Phone number format may be invalid',
        code: 'INVALID_PHONE_FORMAT'
      });
    }
  }

  // Relationship validation for specific groups
  if (evaluator.groupType === 'parent' && !evaluator.relationship) {
    warnings.push({
      field: 'relationship',
      message: 'Relationship specification recommended for parent evaluators',
      code: 'MISSING_RELATIONSHIP'
    });
  }

  if (evaluator.groupType === 'teacher' && !evaluator.relationship) {
    warnings.push({
      field: 'relationship',
      message: 'Subject/role specification recommended for teacher evaluators',
      code: 'MISSING_RELATIONSHIP'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Validates evaluation session data
 */
export const validateEvaluationSession = (session: Partial<EvaluationSession>): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Required fields
  if (!session.evaluatedPersonName || session.evaluatedPersonName.trim().length === 0) {
    errors.push({
      field: 'evaluatedPersonName',
      message: 'Evaluatee name is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  } else if (!NAME_REGEX.test(session.evaluatedPersonName.trim())) {
    errors.push({
      field: 'evaluatedPersonName',
      message: 'Evaluatee name must contain only letters, spaces, hyphens, and apostrophes (2-50 characters)',
      code: 'INVALID_FORMAT',
      severity: 'error'
    });
  }

  // Purpose validation removed as it's not part of EvaluationSession interface

  // Date validations
  if (!session.startDate) {
    errors.push({
      field: 'startDate',
      message: 'Start date is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  }

  if (!session.endDate) {
    errors.push({
      field: 'endDate',
      message: 'End date is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  }

  if (session.startDate && session.endDate) {
    const start = new Date(session.startDate);
    const end = new Date(session.endDate);
    const now = new Date();

    if (start >= end) {
      errors.push({
        field: 'endDate',
        message: 'End date must be after start date',
        code: 'INVALID_DATE_RANGE',
        severity: 'error'
      });
    }

    if (start < now && Math.abs(start.getTime() - now.getTime()) > 24 * 60 * 60 * 1000) {
      warnings.push({
        field: 'startDate',
        message: 'Start date is in the past',
        code: 'PAST_START_DATE'
      });
    }

    const duration = end.getTime() - start.getTime();
    const daysDuration = duration / (1000 * 60 * 60 * 24);
    
    if (daysDuration < 3) {
      warnings.push({
        field: 'endDate',
        message: 'Evaluation period is very short (less than 3 days)',
        code: 'SHORT_EVALUATION_PERIOD'
      });
    } else if (daysDuration > 30) {
      warnings.push({
        field: 'endDate',
        message: 'Evaluation period is very long (more than 30 days)',
        code: 'LONG_EVALUATION_PERIOD'
      });
    }
  }

  // Competency dimensions validation
  if (!session.competencyDimensions || session.competencyDimensions.length === 0) {
    errors.push({
      field: 'competencyDimensions',
      message: 'At least one competency dimension is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  } else {
    session.competencyDimensions.forEach((dimension, index) => {
      const dimensionErrors = validateCompetencyDimension(dimension);
      dimensionErrors.errors.forEach(error => {
        errors.push({
          ...error,
          field: `competencyDimensions[${index}].${error.field}`
        });
      });
    });
  }

  // Evaluator groups validation
  if (session.evaluatorGroups && session.evaluatorGroups.length > 0) {
    session.evaluatorGroups.forEach((group, index) => {
      if (!group.type || !['self', 'parent', 'teacher', 'peer'].includes(group.type)) {
        errors.push({
          field: `evaluatorGroups[${index}].type`,
          message: 'Invalid evaluator group type',
          code: 'INVALID_VALUE',
          severity: 'error'
        });
      }
      if (!group.minRequired || group.minRequired < 0) {
        errors.push({
          field: `evaluatorGroups[${index}].minRequired`,
          message: 'Minimum required evaluators must be a positive number',
          code: 'INVALID_VALUE',
          severity: 'error'
        });
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Validates competency dimension data
 */
export const validateCompetencyDimension = (dimension: Partial<CompetencyDimension>): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!dimension.name || dimension.name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Competency name is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  } else if (dimension.name.trim().length < 3) {
    errors.push({
      field: 'name',
      message: 'Competency name must be at least 3 characters long',
      code: 'MIN_LENGTH',
      severity: 'error'
    });
  }

  if (!dimension.category || dimension.category.trim().length === 0) {
    errors.push({
      field: 'category',
      message: 'Competency category is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  }

  if (!dimension.description || dimension.description.trim().length === 0) {
    warnings.push({
      field: 'description',
      message: 'Competency description is recommended for clarity',
      code: 'MISSING_DESCRIPTION'
    });
  } else if (dimension.description.trim().length < 10) {
    warnings.push({
      field: 'description',
      message: 'Competency description should be more detailed (at least 10 characters)',
      code: 'SHORT_DESCRIPTION'
    });
  }

  // Weight validation removed as it's not part of CompetencyDimension interface

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};



/**
 * Validates evaluation response data
 */
export const validateEvaluationResponse = (response: Partial<EvaluationResponse>): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!response.evaluationId) {
    errors.push({
      field: 'evaluationId',
      message: 'Evaluation ID is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  }

  if (!response.evaluatorId) {
    errors.push({
      field: 'evaluatorId',
      message: 'Evaluator ID is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  }

  if (!response.evaluatorId) {
    errors.push({
      field: 'evaluatorId',
      message: 'Evaluator ID is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  }

  if (!response.questionId) {
    errors.push({
      field: 'questionId',
      message: 'Question ID is required',
      code: 'REQUIRED_FIELD',
      severity: 'error'
    });
  }

  // Rating validation (for rating questions)
  if (response.ratingValue !== undefined) {
    if (typeof response.ratingValue !== 'number' || response.ratingValue < 1 || response.ratingValue > 5) {
      errors.push({
        field: 'ratingValue',
        message: 'Rating value must be between 1 and 5',
        code: 'INVALID_VALUE',
        severity: 'error'
      });
    }
  }

  // Text response validation (for open-ended questions)
  if (response.textResponse !== undefined && response.textResponse.trim().length === 0) {
    warnings.push({
      field: 'textResponse',
      message: 'Text response is empty',
      code: 'EMPTY_TEXT_RESPONSE'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Validates individual rating value
 */
export const validateRating = (ratingValue: number, minValue: number = 1, maxValue: number = 5): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (typeof ratingValue !== 'number') {
    errors.push({
      field: 'ratingValue',
      message: 'Rating value must be a number',
      code: 'INVALID_TYPE',
      severity: 'error'
    });
  } else if (ratingValue < minValue || ratingValue > maxValue) {
    errors.push({
      field: 'ratingValue',
      message: `Rating value must be between ${minValue} and ${maxValue}`,
      code: 'INVALID_VALUE',
      severity: 'error'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Validates evaluator uniqueness within a session
 */
export const validateEvaluatorUniqueness = (evaluators: Evaluator[]): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const emailMap = new Map<string, number[]>();
  const nameMap = new Map<string, number[]>();

  evaluators.forEach((evaluator, index) => {
    // Check email uniqueness
    const email = evaluator.email.toLowerCase().trim();
    if (emailMap.has(email)) {
      emailMap.get(email)!.push(index);
    } else {
      emailMap.set(email, [index]);
    }

    // Check name similarity (case-insensitive)
    const name = evaluator.name.toLowerCase().trim();
    if (nameMap.has(name)) {
      nameMap.get(name)!.push(index);
    } else {
      nameMap.set(name, [index]);
    }
  });

  // Report email duplicates
  emailMap.forEach((indices, email) => {
    if (indices.length > 1) {
      errors.push({
        field: `evaluators[${indices.join(', ')}].email`,
        message: `Duplicate email address: ${email}`,
        code: 'DUPLICATE_EMAIL',
        severity: 'error'
      });
    }
  });

  // Report name duplicates as warnings
  nameMap.forEach((indices, name) => {
    if (indices.length > 1) {
      warnings.push({
        field: `evaluators[${indices.join(', ')}].name`,
        message: `Duplicate or similar names detected: ${name}`,
        code: 'DUPLICATE_NAME'
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Validates evaluator group requirements are met
 */
export const validateGroupRequirements = (
  evaluators: Evaluator[], 
  evaluatorGroups: EvaluatorGroup[]
): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const groupCounts = {
    self: 0,
    parent: 0,
    teacher: 0,
    peer: 0
  };

  // Count evaluators by group
  evaluators.forEach(evaluator => {
    if (evaluator.groupType in groupCounts) {
      groupCounts[evaluator.groupType as keyof typeof groupCounts]++;
    }
  });

  // Check requirements against evaluator groups
  evaluatorGroups.forEach(group => {
    const actual = groupCounts[group.type as keyof typeof groupCounts] || 0;
    if (actual < group.minRequired) {
      errors.push({
        field: `${group.type}Evaluators`,
        message: `Insufficient ${group.type} evaluators: ${actual} assigned, ${group.minRequired} required`,
        code: 'INSUFFICIENT_EVALUATORS',
        severity: 'error'
      });
    } else if (group.maxAllowed && actual > group.maxAllowed) {
      errors.push({
        field: `${group.type}Evaluators`,
        message: `Too many ${group.type} evaluators: ${actual} assigned, maximum ${group.maxAllowed} allowed`,
        code: 'EXCESSIVE_EVALUATORS',
        severity: 'error'
      });
    } else if (actual > group.minRequired * 2) {
      warnings.push({
        field: `${group.type}Evaluators`,
        message: `Many ${group.type} evaluators assigned (${actual}). Consider if all are necessary.`,
        code: 'EXCESSIVE_EVALUATORS'
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Comprehensive validation for complete evaluation setup
 */
export const validateCompleteEvaluation = (
  session: EvaluationSession,
  evaluators: Evaluator[]
): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate session
  const sessionValidation = validateEvaluationSession(session);
  errors.push(...sessionValidation.errors);
  warnings.push(...sessionValidation.warnings);

  // Validate evaluators
  evaluators.forEach((evaluator, index) => {
    const evaluatorValidation = validateEvaluator(evaluator);
    evaluatorValidation.errors.forEach(error => {
      errors.push({
        ...error,
        field: `evaluators[${index}].${error.field}`
      });
    });
    evaluatorValidation.warnings.forEach(warning => {
      warnings.push({
        ...warning,
        field: `evaluators[${index}].${warning.field}`
      });
    });
  });

  // Validate uniqueness
  const uniquenessValidation = validateEvaluatorUniqueness(evaluators);
  errors.push(...uniquenessValidation.errors);
  warnings.push(...uniquenessValidation.warnings);

  // Validate group requirements
  const groupValidation = validateGroupRequirements(evaluators, session.evaluatorGroups || []);
  errors.push(...groupValidation.errors);
  warnings.push(...groupValidation.warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Sanitizes and normalizes input data
 */
export const sanitizeEvaluatorData = (evaluator: Partial<Evaluator>): Partial<Evaluator> => {
  return {
    ...evaluator,
    name: evaluator.name?.trim(),
    email: evaluator.email?.toLowerCase().trim(),
    phone: evaluator.phone?.trim(),
    relationship: evaluator.relationship?.trim()
  };
};

export const sanitizeSessionData = (session: Partial<EvaluationSession>): Partial<EvaluationSession> => {
  return {
    ...session,
    evaluatedPersonName: session.evaluatedPersonName?.trim(),
    title: session.title?.trim(),
    description: session.description?.trim()
  };
};

/**
 * Utility function to format validation errors for display
 */
export const formatValidationErrors = (errors: ValidationError[]): string[] => {
  return errors.map(error => `${error.field}: ${error.message}`);
};

export const formatValidationWarnings = (warnings: ValidationWarning[]): string[] => {
  return warnings.map(warning => `${warning.field}: ${warning.message}`);
};

/**
 * Check if evaluation session is ready to start
 */
export const isEvaluationReady = (
  session: EvaluationSession,
  evaluators: Evaluator[]
): { ready: boolean; issues: string[] } => {
  const validation = validateCompleteEvaluation(session, evaluators);
  
  return {
    ready: validation.isValid,
    issues: formatValidationErrors(validation.errors)
  };
};

/**
 * Export all validation functions
 */
export const EvaluationValidation = {
  validateEvaluator,
  validateEvaluationSession,
  validateCompetencyDimension,
  validateEvaluationResponse,
  validateRating,
  validateEvaluatorUniqueness,
  validateGroupRequirements,
  validateCompleteEvaluation,
  sanitizeEvaluatorData,
  sanitizeSessionData,
  formatValidationErrors,
  formatValidationWarnings,
  isEvaluationReady
};