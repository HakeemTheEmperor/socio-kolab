import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
  phone: optionalText,
  department: optionalText,
  level: optionalText,
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
});

export type ProfileInput = z.input<typeof profileSchema>;
export type PasswordInput = z.infer<typeof passwordSchema>;
