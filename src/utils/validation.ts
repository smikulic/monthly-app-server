// Input validation utilities for security

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];

  if (!email) {
    errors.push("Email is required");
    return { isValid: false, errors };
  }

  if (typeof email !== "string") {
    errors.push("Email must be a string");
    return { isValid: false, errors };
  }

  // Basic email regex - not perfect but catches most invalid formats
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    errors.push("Email format is invalid");
  }

  if (email.length > 254) {
    errors.push("Email is too long (max 254 characters)");
  }

  return { isValid: errors.length === 0, errors };
}

export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];

  if (!password) {
    errors.push("Password is required");
    return { isValid: false, errors };
  }

  if (typeof password !== "string") {
    errors.push("Password must be a string");
    return { isValid: false, errors };
  }

  if (password.length < 6) {
    errors.push("Password must be at least 6 characters long");
  }

  if (password.length > 128) {
    errors.push("Password is too long (max 128 characters)");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  // if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
  //   errors.push("Password must contain at least one special character");
  // }

  // Check for common weak passwords
  const commonPasswords = [
    "password",
    "123456789",
    "qwerty123",
    "admin123",
    "letmein",
    "welcome123",
    "password1",
  ];

  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push("Password is too common, please choose a stronger password");
  }

  return { isValid: errors.length === 0, errors };
}

export function sanitizeString(input: string, maxLength: number = 255): string {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>\"'&]/g, ""); // Basic XSS prevention
}

export function validatePositiveInteger(
  value: any,
  fieldName: string
): ValidationResult {
  const errors: string[] = [];

  if (value === null || value === undefined) {
    errors.push(`${fieldName} is required`);
    return { isValid: false, errors };
  }

  const num = Number(value);

  if (isNaN(num)) {
    errors.push(`${fieldName} must be a number`);
  } else if (!Number.isInteger(num)) {
    errors.push(`${fieldName} must be an integer`);
  } else if (num < 0) {
    errors.push(`${fieldName} must be positive`);
  } else if (num > 2147483647) {
    // PostgreSQL integer limit
    errors.push(`${fieldName} is too large`);
  }

  return { isValid: errors.length === 0, errors };
}

export function validateDate(
  dateString: string,
  fieldName: string
): ValidationResult {
  const errors: string[] = [];

  if (!dateString) {
    errors.push(`${fieldName} is required`);
    return { isValid: false, errors };
  }

  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    errors.push(`${fieldName} must be a valid date`);
  } else {
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) {
      errors.push(`${fieldName} year must be between 1900 and 2100`);
    }
  }

  return { isValid: errors.length === 0, errors };
}
