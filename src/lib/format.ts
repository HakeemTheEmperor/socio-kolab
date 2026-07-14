import type { Prisma } from "@/generated/prisma/client";

const TIME_ZONE = "Africa/Lagos";
const LOCALE = "en-NG";

type AmountLike = number | string | Prisma.Decimal;

/** Format money with the club's currency (e.g. ₦ for NGN). SPEC §8. */
export function formatCurrency(amount: AmountLike, currency = "NGN"): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

/** Up to two initials for an avatar square ("Ada Obi" → "AO"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : ""))
    .toUpperCase();
}

/** Date only, in Africa/Lagos (e.g. "12 Jul 2026"). SPEC §8. */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
  }).format(new Date(date));
}

/** Date + time, in Africa/Lagos (e.g. "12 Jul 2026, 14:30"). */
export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

/** Render a Date as an Africa/Lagos "YYYY-MM-DDTHH:mm" for datetime-local inputs. */
export function toDateTimeLocal(date: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(date));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
