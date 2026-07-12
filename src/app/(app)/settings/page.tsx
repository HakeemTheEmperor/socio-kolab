import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentClub, getClubSettings } from "@/lib/club";
import { requireMembership } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings — Club Portal" };

export default async function SettingsPage() {
  const me = await requireMembership();
  if (!can(me, "settings:edit")) redirect("/dashboard");

  const club = await getCurrentClub();
  const settings = getClubSettings(club.settings);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Manage club details and options.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Club</CardTitle>
          <CardDescription>
            Changing the current period resets the dues dashboard to that period
            while preserving history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm name={club.name} settings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
