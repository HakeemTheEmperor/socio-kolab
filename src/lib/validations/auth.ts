import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

// Shared field pieces, so signup and per-club register validate names, emails,
// and passwords identically (SIGNUP.MD §8).
const nameField = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters.");
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.");
const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters.");

const optionalText = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const registerSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  phone: optionalText,
  department: optionalText,
  level: optionalText,
});

/**
 * Standalone platform signup (SIGNUP.MD §4.1, §8) — no club involved. Adds a
 * confirm-password field over the register fields.
 */
export const signupSchema = z
  .object({
    name: nameField,
    email: emailField,
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

/** A bare email, for resend-verification requests (SIGNUP.MD §4.1, §4.2). */
export const emailOnlySchema = z.object({ email: emailField });

/**
 * Applying to a club while already signed in: the account already exists, so
 * only the per-club membership profile is collected.
 */
export const joinClubSchema = z.object({
  phone: optionalText,
  department: optionalText,
  level: optionalText,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type JoinClubInput = z.infer<typeof joinClubSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
