"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { can } from "@/lib/permissions";
import { profileSchema, passwordSchema } from "@/lib/validations/profile";
import type { ProfileInput, PasswordInput } from "@/lib/validations/profile";

export type ActionResult = { ok: boolean; error?: string };

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const me = await requireMembership();
  if (!can(me, "profile:editOwn")) return { ok: false, error: "Not authorized." };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { name, phone, department, level } = parsed.data;

  // name lives on User; phone/department/level live on Membership.
  await prisma.$transaction([
    prisma.user.update({ where: { id: me.userId }, data: { name } }),
    prisma.membership.update({
      where: { id: me.id },
      data: { phone, department, level },
    }),
  ]);

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function changePassword(input: PasswordInput): Promise<ActionResult> {
  const me = await requireMembership();

  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const user = await prisma.user.findUnique({ where: { id: me.userId } });
  if (!user) return { ok: false, error: "Account not found." };

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { ok: false, error: "Current password is incorrect." };

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: me.userId },
    data: { passwordHash, mustChangePassword: false },
  });

  return { ok: true };
}
