import { Badge } from "@/components/ui/badge";

/** Membership status → badge variant (UI-REFACTOR §C2). */
const VARIANTS = {
  ACTIVE: "success",
  PENDING: "warning",
  INACTIVE: "neutral",
  ALUMNI: "info",
} as const;

export function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  const variant = VARIANTS[status as keyof typeof VARIANTS] ?? "neutral";
  return <Badge variant={variant}>{label}</Badge>;
}
