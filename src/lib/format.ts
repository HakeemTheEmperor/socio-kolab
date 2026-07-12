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
