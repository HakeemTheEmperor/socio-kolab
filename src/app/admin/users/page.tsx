import { Users } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminToggle } from "../user-toggle";

/**
 * Why the toggle is disabled for a given row, or null when it is actionable.
 * These mirror the cases the server action refuses (§5), so the control matches
 * the server truth — but they are only a courtesy; the action re-derives each.
 */
function disabledReason({
  isSelf,
  isAdmin,
  memberships,
  isLastAdmin,
}: {
  isSelf: boolean;
  isAdmin: boolean;
  memberships: number;
  isLastAdmin: boolean;
}): string | null {
  if (isSelf) return "You can't revoke your own admin access.";
  if (isAdmin && isLastAdmin) return "At least one platform admin must remain.";
  if (!isAdmin && memberships > 0) {
    return "This user belongs to a club — a platform admin can't hold a membership.";
  }
  return null;
}

export default async function AdminUsersPage() {
  // The layout already ran the guard; capture the admin for the "self" check.
  const me = await requirePlatformAdmin();

  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      isPlatformAdmin: true,
      createdAt: true,
      _count: { select: { memberships: true } },
    },
  });

  const adminCount = users.filter((u) => u.isPlatformAdmin).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Users ({users.length})</CardTitle>
        <CardDescription>
          Everyone with an account. Read-only, except for granting or revoking
          platform-admin access — admins never see or edit a club&apos;s data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <EmptyState icon={Users} message="No users yet." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Memberships</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Admin access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const reason = disabledReason({
                    isSelf: user.id === me.id,
                    isAdmin: user.isPlatformAdmin,
                    memberships: user._count.memberships,
                    isLastAdmin: adminCount <= 1,
                  });
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        {user.emailVerified ? (
                          <Badge variant="success">Yes</Badge>
                        ) : (
                          <Badge variant="neutral">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>{user._count.memberships}</TableCell>
                      <TableCell>
                        {user.isPlatformAdmin ? (
                          <Badge variant="info">Admin</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <AdminToggle
                          userId={user.id}
                          name={user.name}
                          isAdmin={user.isPlatformAdmin}
                          disabledReason={reason}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
