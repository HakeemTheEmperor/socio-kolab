"use server";

import bcrypt from "bcryptjs";

import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentClub } from "@/lib/club";
import { registerSchema } from "@/lib/validations/auth";

export type RegisterState = { error?: string };

export async function registerAction(
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { name, email, password, phone, department, level } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with this email already exists." };
  }

  const club = await getCurrentClub();
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        memberships: {
          create: {
            clubId: club.id,
            role: "MEMBER",
            status: "PENDING",
            phone: phone ?? null,
            department: department ?? null,
            level: level ?? null,
          },
        },
      },
    });
  } catch {
    return { error: "Could not create your account. Please try again." };
  }

  // Sign in immediately; the pending-approval gate takes over on /dashboard.
  // signIn throws a redirect on success, which must propagate.
  await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  return {};
}
