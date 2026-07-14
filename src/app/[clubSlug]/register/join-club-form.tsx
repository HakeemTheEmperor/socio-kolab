"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { joinClubAction, type RegisterState } from "./actions";

/**
 * The signed-in half of registration: the account exists, so this collects only
 * the membership profile (which is per-club) and files a PENDING membership.
 */
export function JoinClubForm({ departments }: { departments: string[] }) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    joinClubAction.bind(null, clubSlug),
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="department">Department</Label>
          {departments.length > 0 ? (
            <Select name="department">
              <SelectTrigger id="department">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id="department" name="department" />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="level">Level</Label>
          <Input id="level" name="level" placeholder="e.g. 300" />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Applying…" : "Apply to join"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/clubs" className="font-medium text-foreground underline">
          Back to your clubs
        </Link>
      </p>
    </form>
  );
}
