"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown,
  LayoutGrid,
  LogOut,
  KeyRound,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { navItems } from "./nav";
import { ClubMark } from "@/components/club-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MemberStatus, Role } from "@/generated/prisma/client";

export type ShellClub = {
  slug: string;
  name: string;
  logoUrl: string | null;
};

export type ShellUser = {
  name: string;
  role: Role;
  status: MemberStatus;
};

export type SidebarProps = {
  club: ShellClub;
  user: ShellUser;
  /** The user's other ACTIVE memberships, for the switcher dropdown. */
  otherClubs: ShellClub[];
  pendingCount: number;
  signOut: () => Promise<void>;
  /** Mobile: close the slide-over after navigating (UI-REFACTOR §B3). */
  onNavigate?: () => void;
};

function ClubSwitcher({
  club,
  otherClubs,
  onNavigate,
}: Pick<SidebarProps, "club" | "otherClubs" | "onNavigate">) {
  // With nothing to switch to, the block is just a link to /clubs — a dropdown
  // holding a single item would be a menu that says nothing (§B2).
  if (otherClubs.length === 0) {
    return (
      <Link
        href="/clubs"
        onClick={onNavigate}
        title="All clubs"
        className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-surface-hover"
      >
        <ClubMark club={club} />
        <span className="truncate text-sm font-semibold">{club.name}</span>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-surface-hover"
          />
        }
      >
        <ClubMark club={club} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {club.name}
        </span>
        <ChevronsUpDown
          aria-hidden
          strokeWidth={1.75}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="sr-only">Switch club</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56"
      >
        <DropdownMenuLabel>Switch club</DropdownMenuLabel>
        {otherClubs.map((other) => (
          <DropdownMenuItem
            key={other.slug}
            render={
              <Link
                href={`/${other.slug}/dashboard`}
                onClick={onNavigate}
              />
            }
          >
            <ClubMark
              club={other}
              className="size-5 rounded text-[10px]"
            />
            <span className="truncate">{other.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={
            <Link
              href="/clubs"
              onClick={onNavigate}
            />
          }
        >
          <LayoutGrid strokeWidth={1.75} />
          All clubs
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({
  club,
  user,
  signOut,
  onNavigate,
}: Pick<SidebarProps, "club" | "user" | "signOut" | "onNavigate">) {
  const role = user.role.charAt(0) + user.role.slice(1).toLowerCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-surface-hover"
          />
        }
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-tint text-xs font-semibold text-primary-tint-fg"
        >
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {user.name}
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {role}
          </span>
        </span>
        <ChevronsUpDown
          aria-hidden
          strokeWidth={1.75}
          className="size-4 shrink-0 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56"
      >
        <DropdownMenuItem
          render={
            <Link
              href={`/${club.slug}/profile`}
              onClick={onNavigate}
            />
          }
        >
          <UserRound strokeWidth={1.75} />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <Link
              href={`/${club.slug}/profile#password`}
              onClick={onNavigate}
            />
          }
        >
          <KeyRound strokeWidth={1.75} />
          Change password
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* The form wraps the item, rather than being handed to `render`: Base UI
            passes the item's children into the rendered element, so a <form> that
            already had a <button> child swallowed the label and drew an empty row.
            `nativeButton` then tells Menu.Item that what it renders really is a
            <button>. It assumes otherwise, and would otherwise layer its own role
            and aria-disabled on top of the native ones. */}
        <form action={signOut}>
          <DropdownMenuItem
            nativeButton
            render={
              <button
                type="submit"
                className="w-full"
              />
            }
          >
            <LogOut strokeWidth={1.75} />
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar({
  club,
  user,
  otherClubs,
  pendingCount,
  signOut,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const items = navItems(club.slug, user, pendingCount);

  return (
    <div className="flex h-full flex-col gap-2 bg-surface p-3">
      <ClubSwitcher
        club={club}
        otherClubs={otherClubs}
        onNavigate={onNavigate}
      />

      <nav className="flex-1 space-y-1">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary-tint font-medium text-primary-tint-fg"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              )}
            >
              <Icon
                aria-hidden
                strokeWidth={1.75}
                className="size-5 shrink-0"
              />
              <span className="flex-1 truncate">{label}</span>
              {badge ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-warning-tint px-1.5 text-xs font-medium text-warning-tint-fg">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <UserMenu
        club={club}
        user={user}
        signOut={signOut}
        onNavigate={onNavigate}
      />
    </div>
  );
}
