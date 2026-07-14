import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A single number with its label and an icon (UI-REFACTOR §C2).
 *
 * `tone="warning"` is for a count that wants acting on — pending approvals when
 * there are any. It is the only case where a stat card leaves the brand palette.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "warning";
}) {
  const warning = tone === "warning";

  const body = (
    <div
      className={cn(
        "flex h-full items-start justify-between gap-3 rounded-xl border p-6",
        warning ? "border-warning/30 bg-warning-tint" : "border-border bg-surface",
        href && "transition-colors hover:border-border-strong",
      )}
    >
      <div>
        <p
          className={cn(
            "text-[13px]",
            warning ? "text-warning-tint-fg" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        <p className="mt-1 text-[28px] font-semibold leading-none">{value}</p>
      </div>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          warning ? "bg-warning/15" : "bg-primary-tint",
        )}
      >
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            "size-5",
            warning ? "text-warning-tint-fg" : "text-primary-tint-fg",
          )}
        />
      </span>
    </div>
  );

  return href ? (
    <Link href={href} className="rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}
