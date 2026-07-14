import type { LucideIcon } from "lucide-react";

/**
 * The state every list falls back to (UI-REFACTOR §C2): an icon, one line saying
 * what would be here, and — only when the viewer can actually do something about
 * it — the action that fills it.
 */
export function EmptyState({
  icon: Icon,
  message,
  action,
}: {
  icon: LucideIcon;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted">
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className="size-5 text-muted-foreground"
        />
      </span>
      <p className="text-[13px] text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
