import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

const TIME_ZONE = "Africa/Lagos";

/** The calendar-tile date used on every event card (§C2): day large, month small. */
export function DateBlock({
  date,
  className,
}: {
  date: Date | string;
  className?: string;
}) {
  const parts = new Intl.DateTimeFormat("en-NG", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(date));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return (
    <div
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-lg bg-primary-tint leading-none",
        className,
      )}
    >
      <span className="text-lg font-semibold text-primary-tint-fg">{get("day")}</span>
      <span className="text-[11px] uppercase text-primary-tint-fg/80">
        {get("month")}
      </span>
    </div>
  );
}

/** Initials avatar. Members list, RSVP lists, check-in rows. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-primary-tint text-xs font-semibold text-primary-tint-fg",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
