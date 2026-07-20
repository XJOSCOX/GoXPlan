import type { SignupInput } from "../types";

export type ValidationResult = {
  ok: boolean;
  message?: string;
};

export function validateSignup(input: SignupInput): ValidationResult {
  if (!input.firstName.trim()) return { ok: false, message: "First name is required." };
  if (!input.lastName.trim()) return { ok: false, message: "Last name is required." };
  if (!isValidUsername(input.username)) {
    return { ok: false, message: "Username must be 3-24 characters and use only letters, numbers, dots, underscores, or hyphens." };
  }
  if (!isValidEmail(input.email)) return { ok: false, message: "Enter a valid email address." };

  const password = validatePassword(input.password);
  if (!password.ok) return password;

  return { ok: true };
}

export function validateLogin(login: string, password: string): ValidationResult {
  if (!login.trim()) return { ok: false, message: "Username or email is required." };
  if (!password) return { ok: false, message: "Password is required." };
  return { ok: true };
}

export function validatePassword(password: string): ValidationResult {
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (!/[a-z]/.test(password)) return { ok: false, message: "Password needs at least one lowercase letter." };
  if (!/[A-Z]/.test(password)) return { ok: false, message: "Password needs at least one uppercase letter." };
  if (!/[0-9]/.test(password)) return { ok: false, message: "Password needs at least one number." };
  if (!/[^A-Za-z0-9]/.test(password)) return { ok: false, message: "Password needs at least one symbol." };
  return { ok: true };
}

export function passwordRules(password: string) {
  return [
    { label: "8 characters minimum", done: password.length >= 8 },
    { label: "Lowercase letter", done: /[a-z]/.test(password) },
    { label: "Uppercase letter", done: /[A-Z]/.test(password) },
    { label: "Number", done: /[0-9]/.test(password) },
    { label: "Symbol", done: /[^A-Za-z0-9]/.test(password) },
  ];
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidUsername(username: string) {
  return /^[a-zA-Z0-9._-]{3,24}$/.test(username.trim());
}
