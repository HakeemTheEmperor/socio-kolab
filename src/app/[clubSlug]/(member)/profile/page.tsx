import type { Metadata } from "next";

import { getClubSettings } from "@/lib/club";
import { requireClubAccess } from "@/lib/club-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Profile — Club Portal" };

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const { club, membership: me } = await requireClubAccess(clubSlug);
  const settings = getClubSettings(club.settings);

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-muted-foreground">{me.user.email}</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your details</CardTitle>
          <CardDescription>Update your name and membership info.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            departments={settings.departments}
            name={me.user.name}
            phone={me.phone}
            department={me.department}
            level={me.level}
          />
        </CardContent>
      </Card>

      <Card id="password" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
