import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireMembership } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard — Club Portal" };

export default async function DashboardPage() {
  const membership = await requireMembership();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome, {membership.user.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground">
          You&apos;re signed in as {membership.role.toLowerCase()}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>
            Stat cards, dues status, and upcoming events arrive in a later phase.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Auth is wired up: your session resolves to a membership
          ({membership.role} / {membership.status}) scoped to the current club.
        </CardContent>
      </Card>
    </div>
  );
}
