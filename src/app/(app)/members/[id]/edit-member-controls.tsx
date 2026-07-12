"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  changeMemberStatus,
  changeMemberCommittee,
  changeMemberRole,
  type ActionResult,
} from "../actions";

const NONE = "__none__";
const STATUSES = ["ACTIVE", "INACTIVE", "ALUMNI"];
const ROLES = ["MEMBER", "EXEC", "PRESIDENT"];

export function EditMemberControls({
  membershipId,
  isSelf,
  canEditStatus,
  canEditRole,
  committees,
  status: initialStatus,
  committee: initialCommittee,
  role: initialRole,
}: {
  membershipId: string;
  isSelf: boolean;
  canEditStatus: boolean;
  canEditRole: boolean;
  committees: string[];
  status: string;
  committee: string | null;
  role: string;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [committee, setCommittee] = useState(initialCommittee ?? NONE);
  const [role, setRole] = useState(initialRole);

  function apply(
    value: string,
    prev: string,
    setLocal: (v: string) => void,
    action: () => Promise<ActionResult>,
    ok: string,
  ) {
    setLocal(value);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(ok);
      } else {
        setLocal(prev); // revert on failure
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  if (!canEditStatus && !canEditRole) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {canEditStatus ? (
        <>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              disabled={pending || isSelf}
              onValueChange={(v) => {
                if (v)
                  apply(v, status, setStatus,
                    () => changeMemberStatus(membershipId, v), "Status updated.");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSelf ? (
              <p className="text-xs text-muted-foreground">
                You can&apos;t change your own status.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Committee</Label>
            <Select
              value={committee}
              disabled={pending}
              onValueChange={(v) => {
                if (v)
                  apply(v, committee, setCommittee,
                    () => changeMemberCommittee(membershipId, v === NONE ? "" : v),
                    "Committee updated.");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {committees.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}

      {canEditRole ? (
        <div className="space-y-2">
          <Label>Role</Label>
          <Select
            value={role}
            disabled={pending || isSelf}
            onValueChange={(v) => {
              if (v)
                apply(v, role, setRole,
                  () => changeMemberRole(membershipId, v), "Role updated.");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r.charAt(0) + r.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSelf ? (
            <p className="text-xs text-muted-foreground">
              You can&apos;t change your own role.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
