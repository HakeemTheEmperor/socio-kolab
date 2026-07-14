"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar, type SidebarProps } from "./sidebar";
import { pageTitle } from "./nav";
import { TOPBAR_ACTIONS_ID } from "./topbar-actions";

type AppShellProps = Omit<SidebarProps, "onNavigate"> & {
  children: React.ReactNode;
  /** Shown until the user changes the default password they were imported with. */
  mustChangePassword: boolean;
};

export function AppShell({ children, mustChangePassword, ...sidebar }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const title = pageTitle(pathname, sidebar.club.slug);

  return (
    <div className="flex min-h-screen">
      {/* ≥1024px: always visible. Sticky, full viewport height (§B2). */}
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 border-r border-border lg:block">
        <Sidebar {...sidebar} />
      </aside>

      {/* <1024px: the same sidebar as a slide-over, closing on navigation (§B3). */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[260px] p-0 sm:max-w-[260px]">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Sidebar {...sidebar} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu strokeWidth={1.75} />
            <span className="sr-only">Open menu</span>
          </Button>

          <h1 className="min-w-0 flex-1 truncate text-lg font-medium">{title}</h1>

          {/* Pages portal their contextual action here (see topbar-actions.tsx). */}
          <div id={TOPBAR_ACTIONS_ID} className="flex items-center gap-2" />
        </header>

        {mustChangePassword ? (
          <div className="border-b border-border bg-warning-tint px-4 py-2 text-sm text-warning-tint-fg lg:px-6">
            Please{" "}
            <Link
              href={`/${sidebar.club.slug}/profile#password`}
              className="font-medium underline"
            >
              change your password
            </Link>{" "}
            — you&apos;re using a default password.
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
