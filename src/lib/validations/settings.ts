import { z } from "zod";

export const settingsSchema = z.object({
  name: z.string().trim().min(2, "Club name is required.").max(100),
  duesAmount: z.coerce
    .number({ message: "Enter a valid dues amount." })
    .min(0, "Dues amount can't be negative.")
    .max(100_000_000),
  currency: z.string().trim().min(1, "Currency is required.").max(8),
  currentPeriod: z.string().trim().min(1, "Current period is required.").max(20),
  departments: z.array(z.string().trim().min(1).max(100)).max(50),
  committees: z.array(z.string().trim().min(1).max(100)).max(50),
});

export type SettingsInput = z.input<typeof settingsSchema>;
