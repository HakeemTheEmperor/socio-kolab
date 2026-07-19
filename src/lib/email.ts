/**
 * Transactional email (SIGNUP.MD §3). The app sends two kinds of mail —
 * email verification and password reset — both single-link, single-purpose.
 *
 * Provider is Resend, called over plain `fetch` (no SDK dependency). When
 * `RESEND_API_KEY` is unset the sender drops into **console mode**: it logs the
 * link to the server console instead of sending. Development and CI must never
 * require a mail provider, mirroring the no-op session store (SIGNUP.MD §10.2).
 *
 * Env: `RESEND_API_KEY` (unset → console mode), `EMAIL_FROM` (e.g.
 * `Club Portal <noreply@yourdomain>`; its domain must be verified in Resend).
 * `APP_URL` builds the absolute links, but that happens in the callers — the
 * fully-formed URL is passed in here.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Send one email, or — with no API key — log it. Throws on a Resend API error
 * so callers can decide whether to surface it; console mode never throws.
 */
async function sendEmail({ to, subject, text, html }: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Console fallback: the link is the only thing a developer needs.
    console.info(
      `\n[email] (console mode — RESEND_API_KEY unset)\n` +
        `  to:      ${to}\n` +
        `  subject: ${subject}\n` +
        `${text}\n`,
    );
    return;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error(
      "EMAIL_FROM is not set. Set it to a verified sender, e.g. " +
        '"Club Portal <noreply@yourdomain>".',
    );
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Resend rejected the email (HTTP ${res.status}): ${detail}`,
    );
  }
}

/** Minimal, client-agnostic HTML: one line of text plus a single button-ish link. */
function linkEmailHtml(intro: string, url: string, cta: string): string {
  return (
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">` +
    `<p>${intro}</p>` +
    `<p><a href="${url}">${cta}</a></p>` +
    `<p style="color:#666;font-size:13px">If the link doesn't work, paste this into your browser:<br>${url}</p>` +
    `</div>`
  );
}

/** Email a new (or re-requesting) user their verification link (SIGNUP.MD §4). */
export function sendVerificationEmail(
  to: string,
  name: string,
  verifyUrl: string,
): Promise<void> {
  const intro = `Hi ${name}, confirm your email to finish setting up your account.`;
  return sendEmail({
    to,
    subject: "Confirm your email",
    text: `${intro}\n\nVerify your email: ${verifyUrl}`,
    html: linkEmailHtml(intro, verifyUrl, "Verify your email"),
  });
}

/**
 * Email a bulk-imported member their invite link (BULKUPLOAD.MD §6). The link
 * both verifies the address and lets them choose their own password — no
 * password is ever generated or sent.
 */
export function sendInviteEmail(
  to: string,
  name: string,
  clubName: string,
  inviteUrl: string,
): Promise<void> {
  const intro = `Hi ${name}, you've been added to ${clubName} on Club Portal. Set your password to get started.`;
  return sendEmail({
    to,
    subject: `You've been added to ${clubName}`,
    text:
      `${intro}\n\nSet your password: ${inviteUrl}\n\n` +
      `This link expires in 7 days.`,
    html: linkEmailHtml(intro, inviteUrl, "Set your password"),
  });
}

/** Email a user their password-reset link (SIGNUP.MD §9). */
export function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string,
): Promise<void> {
  const intro = `Hi ${name}, we received a request to reset your password.`;
  return sendEmail({
    to,
    subject: "Reset your password",
    text:
      `${intro}\n\nReset your password: ${resetUrl}\n\n` +
      `This link expires in 1 hour. If you didn't request it, ignore this email.`,
    html: linkEmailHtml(intro, resetUrl, "Reset your password"),
  });
}
