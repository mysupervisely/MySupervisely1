import bcrypt from "bcryptjs";

const BCRYPT_COST_FACTOR = 12;

// bcrypt silently ignores bytes past 72 — reject longer passwords outright
// rather than truncate without telling the user.
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 72;

// A short blocklist of extremely common passwords. Per NIST 800-63B,
// screening against known-common/breached passwords is more effective than
// forced composition rules (which we keep minimal below).
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "letmein123",
  "welcome123",
  "changeme123",
  "iloveyou1",
  "admin1234",
  "doseprepped",
]);

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Password must be no more than ${MAX_PASSWORD_LENGTH} characters long.`);
  }
  if (!/[a-zA-Z]/.test(password)) {
    errors.push("Password must contain at least one letter.");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number.");
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push("This password is too common. Please choose a different one.");
  }

  return { valid: errors.length === 0, errors };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
