import {
  Calendar,
  LayoutDashboard,
  Settings,
  Users,
  Vote,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { can } from "@/lib/permissions";
import type { MemberStatus, Role } from "@/generated/prisma/client";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Rendered as a count badge when > 0 (UI-REFACTOR §B2). */
  badge?: number;
};

/**
 * The sidebar's nav items, role-filtered through the same `can()` the server
 * actions use. This is presentation only — every page and action re-checks
 * server-side, so hiding a link is a convenience, never the guard.
 */
export function navItems(
  clubSlug: string,
  membership: { role: Role; status: MemberStatus },
  pendingCount: number,
): NavItem[] {
  const at = (path: string) => `/${clubSlug}${path}`;

  return [
    { href: at("/dashboard"), label: "Dashboard", icon: LayoutDashboard },
    {
      href: at("/members"),
      label: "Members",
      icon: Users,
      badge: can(membership, "member:approve") ? pendingCount : undefined,
    },
    ...(can(membership, "dues:viewDashboard")
      ? [{ href: at("/dues"), label: "Dues", icon: Wallet }]
      : []),
    { href: at("/events"), label: "Events", icon: Calendar },
    { href: at("/elections"), label: "Elections", icon: Vote },
    ...(can(membership, "settings:edit")
      ? [{ href: at("/settings"), label: "Settings", icon: Settings }]
      : []),
  ];
}

/** Topbar title for a path. Detail pages keep their section's name; the entity
 *  name is the page's own h1. */
export function pageTitle(pathname: string, clubSlug: string): string {
  const section = pathname.replace(`/${clubSlug}`, "").split("/")[1] ?? "";
  const titles: Record<string, string> = {
    dashboard: "Dashboard",
    members: "Members",
    dues: "Dues",
    events: "Events",
    elections: "Elections",
    profile: "Profile",
    settings: "Settings",
  };
  return titles[section] ?? "";
}
