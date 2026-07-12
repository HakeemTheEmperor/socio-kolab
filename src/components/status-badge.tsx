import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  ACTIVE:
    "border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  PENDING:
    "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  INACTIVE:
    "border-transparent bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ALUMNI:
    "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

export function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return (
    <Badge variant="outline" className={cn(STYLES[status])}>
      {label}
    </Badge>
  );
}
