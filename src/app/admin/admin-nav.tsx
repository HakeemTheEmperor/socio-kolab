"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/clubs", label: "Clubs" },
  { href: "/admin/users", label: "Users" },
] as const;

/** The segment nav: Overview · Clubs · Users, with the current section marked. */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex gap-1 border-b border-border" aria-label="Admin sections">
      {LINKS.map(({ href, label }) => {
        // "/admin" is active only exactly; the others match their subtree.
        const active =
          href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
