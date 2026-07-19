import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Single-use token lifecycle for email verification and password reset
 * (SIGNUP.MD §2, §9). Node-only — uses `node:crypto` and Prisma, so it must
 * never be imported by the edge proxy.
 *
 * The design is one implementation over a token *slot*: the trio of `User`
 * columns a token lives in. Verification and reset are never the same slot, so
 * a resend on one can't disturb a pending link on the other (SIGNUP.MD §1.2).
 *
 * Security properties:
 *  - **Hashed at rest.** The email carries the raw token; the DB stores only
 *    `sha256(raw)`. A leaked row cannot be turned into a working link.
 *  - **One live token per user per slot.** Issuing overwrites the columns,
 *    which *is* the invalidation of any prior link — no delete-then-insert.
 *  - **Single-use by construction.** Consuming is one guarded `updateMany`
 *    gated on a matching hash and an unexpired token; a double-consume finds
 *    nothing to update. No explicit transaction needed.
 */

/** Which trio of `User` columns a token occupies, plus how long it lives. */
export interface TokenSlot {
  hash: "verificationTokenHash" | "resetTokenHash";
  sentAt: "verificationTokenSentAt" | "resetTokenSentAt";
  expiry: "verificationTokenExpiry" | "resetTokenExpiry";
  /** Lifetime of a freshly issued token, in milliseconds. */
  ttlMs: number;
}

const HOUR = 60 * 60 * 1000;

/**
 * Verification links are a formality (proof the address receives mail), so they
 * live a generous 24h. Reset links are a credential, so they live only 1h
 * (SIGNUP.MD §9.1).
 */
export const VERIFICATION_SLOT: TokenSlot = {
  hash: "verificationTokenHash",
  sentAt: "verificationTokenSentAt",
  expiry: "verificationTokenExpiry",
  ttlMs: 24 * HOUR,
};

export const RESET_SLOT: TokenSlot = {
  hash: "resetTokenHash",
  sentAt: "resetTokenSentAt",
  expiry: "resetTokenExpiry",
  ttlMs: 1 * HOUR,
};

/** A resend is refused if the previous one went out less than this ago. */
export const RESEND_THROTTLE_MS = 60 * 1000;

/** 32 bytes of entropy, url-safe so it drops straight into a query string. */
export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The at-rest form of a token: lowercase hex sha256. Deterministic. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Whether a resend must be refused because the last one is too recent. A null
 * `sentAt` (never sent) is never throttled.
 */
export function isThrottled(sentAt: Date | null, now: Date = new Date()): boolean {
  if (!sentAt) return false;
  return now.getTime() - sentAt.getTime() < RESEND_THROTTLE_MS;
}

export type IssueResult =
  | { ok: true; raw: string }
  | { ok: false; reason: "throttled" };

/**
 * Issue a fresh token into `slot` for `userId`, returning the raw token to mail.
 * Overwriting the columns invalidates any previous link. Refuses (without
 * touching the DB) if the slot was written to less than `RESEND_THROTTLE_MS`
 * ago; callers surface that as a neutral "sent" either way (SIGNUP.MD §4.1).
 */
export async function issueToken(
  slot: TokenSlot,
  userId: string,
  now: Date = new Date(),
): Promise<IssueResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { [slot.sentAt]: true },
  });
  if (!user) return { ok: false, reason: "throttled" };

  const lastSent = (user as unknown as Record<string, Date | null>)[
    slot.sentAt
  ];
  if (isThrottled(lastSent, now)) return { ok: false, reason: "throttled" };

  const raw = generateRawToken();
  await prisma.user.update({
    where: { id: userId },
    data: {
      [slot.hash]: hashToken(raw),
      [slot.sentAt]: now,
      [slot.expiry]: new Date(now.getTime() + slot.ttlMs),
    },
  });
  return { ok: true, raw };
}

/**
 * Atomically consume a token from `slot`: succeeds only for a raw token whose
 * hash matches an unexpired row. On success it clears the slot's three columns
 * and applies `onConsume` (e.g. `emailVerified` for verification, the new
 * password hash for reset) in the same guarded update — so the state change and
 * the invalidation are indivisible, and a replay finds nothing to match.
 *
 * Returns true iff exactly one row was consumed; false for
 * invalid / expired / already-used.
 */
export async function consumeToken(
  slot: TokenSlot,
  raw: string,
  onConsume: Prisma.UserUpdateManyMutationInput,
  now: Date = new Date(),
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: {
      [slot.hash]: hashToken(raw),
      [slot.expiry]: { gt: now },
    },
    data: {
      ...onConsume,
      [slot.hash]: null,
      [slot.sentAt]: null,
      [slot.expiry]: null,
    },
  });
  return count === 1;
}

/** Issue a verification token for `userId` (SIGNUP.MD §2). */
export function createVerificationToken(userId: string): Promise<IssueResult> {
  return issueToken(VERIFICATION_SLOT, userId);
}

/**
 * Consume a verification token: on success the account is marked verified as of
 * now, in the same atomic update that burns the token (SIGNUP.MD §2).
 */
export function consumeVerificationToken(raw: string): Promise<boolean> {
  return consumeToken(VERIFICATION_SLOT, raw, { emailVerified: new Date() });
}

/** Issue a password-reset token for `userId` (SIGNUP.MD §9.1). */
export function createResetToken(userId: string): Promise<IssueResult> {
  return issueToken(RESET_SLOT, userId);
}
