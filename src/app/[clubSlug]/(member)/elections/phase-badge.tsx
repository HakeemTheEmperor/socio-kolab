import { Badge } from "@/components/ui/badge";
import type { ElectionPhase } from "@/lib/elections";

/** Human label + badge tint for each phase, shared by the list and detail pages. */
const PHASE_META: Record<ElectionPhase, { label: string; variant: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  draft: { label: "Draft", variant: "neutral" },
  scheduled: { label: "Scheduled", variant: "info" },
  applications: { label: "Applications open", variant: "warning" },
  review: { label: "Under review", variant: "info" },
  voting: { label: "Voting open", variant: "success" },
  closed: { label: "Closed", variant: "neutral" },
  cancelled: { label: "Cancelled", variant: "danger" },
};

export function phaseLabel(phase: ElectionPhase): string {
  return PHASE_META[phase].label;
}

export function PhaseBadge({ phase }: { phase: ElectionPhase }) {
  const meta = PHASE_META[phase];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
