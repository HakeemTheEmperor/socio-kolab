import { z } from "zod";

export const paymentSchema = z.object({
  membershipId: z.string().min(1),
  period: z.string().trim().min(1).max(20),
  amount: z.coerce
    .number({ message: "Enter a valid amount." })
    .positive("Amount must be greater than 0.")
    .max(100_000_000, "Amount is too large."),
  method: z.enum(["cash", "transfer", "other"]).optional(),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type PaymentInput = z.input<typeof paymentSchema>;
