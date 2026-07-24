import type { Metadata } from "next";

import { signOut } from "@/auth";
import { requirePlatformAdmin } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: "Admin — Club Portal" };

/**
 * The guard runs once here for the whole `/admin` segment (Overview / Clubs /
 * Users), rather than being repeated in each `page.tsx` — see DECISIONS.md,
 * "Phase — Admin portal". The actions still carry their own independent checks:
 * the layout guard protects pages, not the server-action entry points.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Not an admin → 404. Nobody learns this area exists.
  const admin = await requirePlatformAdmin();

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-lg font-medium">Platform admin</h1>
          <p className="text-[13px] text-muted-foreground">
            Signed in as {admin.email} · club lifecycle &amp; platform roles
          </p>
        </div>
        <form action={doSignOut}>
          <Button variant="outline" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </div>

      <AdminNav />

      {children}
    </main>
  );
}
