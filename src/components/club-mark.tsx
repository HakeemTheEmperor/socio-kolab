import { cn } from "@/lib/utils";

/**
 * A club's logo, or a primary-colored square with its initial when it has none
 * (§B2). Used by the sidebar, the club switcher, and the register page.
 */
export function ClubMark({
  club,
  className,
}: {
  club: { name: string; logoUrl: string | null };
  className?: string;
}) {
  if (club.logoUrl) {
    return (
      // Club logos are arbitrary external URLs; next/image would need every host
      // allow-listed in next.config.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={club.logoUrl}
        alt=""
        className={cn("size-8 shrink-0 rounded-md object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-fg",
        className,
      )}
    >
      {club.name.charAt(0).toUpperCase()}
    </span>
  );
}
