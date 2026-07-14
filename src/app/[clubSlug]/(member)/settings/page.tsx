import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getClubSettings, getClubTheme } from "@/lib/club";
import { requireClubAccess } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsForm } from "./settings-form";
import { AppearanceForm } from "./appearance-form";

export const metadata: Metadata = { title: "Settings — Club Portal" };

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "settings:edit")) redirect(`/${clubSlug}/dashboard`);

  const settings = getClubSettings(club.settings);

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-muted-foreground">
        Manage club details and options.
      </p>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>
            Pick three colors; everything else — hover states, borders, muted text —
            is derived from them. Paid/unpaid colors never change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AppearanceForm theme={getClubTheme(club.settings)} />
        </CardContent>
      </Card>
    </div>
  );
}
