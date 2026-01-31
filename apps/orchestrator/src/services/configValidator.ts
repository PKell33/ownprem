import type { ConfigField } from '@ownprem/shared';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates user-provided configuration against a manifest's configSchema.
 * This ensures type correctness and valid option values before deployment.
 */
export function validateUserConfig(
  config: Record<string, unknown>,
  schema: ConfigField[]
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const field of schema) {
    // Skip generated/inherited fields - these are set by the system
    if (field.generated || field.inheritFrom) continue;

    const value = config[field.name];

    // Check required fields
    if (field.required && value === undefined) {
      errors.push({
        field: field.name,
        message: `Required field "${field.label}" is missing`,
      });
      continue;
    }

    // Skip if not provided and not required
    if (value === undefined) continue;

    // Type validation
    switch (field.type) {
      case 'string':
      case 'password':
        if (typeof value !== 'string') {
          errors.push({
            field: field.name,
            message: `"${field.label}" must be a string`,
          });
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push({
            field: field.name,
            message: `"${field.label}" must be a number`,
          });
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push({
            field: field.name,
            message: `"${field.label}" must be a boolean`,
          });
        }
        break;

      case 'select':
        if (typeof value !== 'string') {
          errors.push({
            field: field.name,
            message: `"${field.label}" must be a string`,
          });
        } else if (field.options && !field.options.includes(value)) {
          errors.push({
            field: field.name,
            message: `"${field.label}" must be one of: ${field.options.join(', ')}`,
          });
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
