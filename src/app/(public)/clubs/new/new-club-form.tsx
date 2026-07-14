"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/slug";
import {
  checkSlug,
  requestClub,
  type NewClubState,
  type SlugCheck,
} from "./actions";

type SlugState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export function NewClubForm() {
  const [state, formAction, pending] = useActionState<NewClubState, FormData>(
    requestClub,
    {},
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Until the user edits the slug themselves, it follows the name.
  const [slugEdited, setSlugEdited] = useState(false);
  // The last slug we got an answer for. State holds only what the server said;
  // "checking" is derived from it being out of date, so the effect never has to
  // setState synchronously to announce that a check is in flight.
  const [checked, setChecked] = useState<{
    slug: string;
    result: SlugCheck;
  } | null>(null);

  const effectiveSlug = slugEdited ? slug : slugify(name);

  const slugState: SlugState = !effectiveSlug
    ? { kind: "idle" }
    : checked?.slug !== effectiveSlug
      ? { kind: "checking" }
      : checked.result.ok
        ? { kind: "ok" }
        : { kind: "error", message: checked.result.error };

  // Debounced live check (format + uniqueness) — advisory; the server re-checks.
  useEffect(() => {
    if (!effectiveSlug) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await checkSlug(effectiveSlug);
      if (!cancelled) setChecked({ slug: effectiveSlug, result });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [effectiveSlug]);

  if (state.submitted) {
    return (
      <div className="space-y-4 text-center">
        <p className="font-medium">Request submitted</p>
        <p className="text-sm text-muted-foreground">
          {state.submitted.name} is awaiting review by a platform admin.
          You&apos;ll get access as its president once it&apos;s approved — it
          shows on your clubs page until then.
        </p>
        <Button render={<Link href="/clubs" />}>Your clubs</Button>
      </div>
    );
  }

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
        <Label htmlFor="name">Club name</Label>
        <Input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Adrian Tech Society"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Club address</Label>
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">/</span>
          <Input
            id="slug"
            name="slug"
            required
            value={effectiveSlug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value);
            }}
            aria-invalid={slugState.kind === "error"}
            placeholder="adrian-tech"
          />
        </div>
        <p
          className={
            slugState.kind === "error"
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
          role={slugState.kind === "error" ? "alert" : undefined}
        >
          {slugState.kind === "error"
            ? slugState.message
            : slugState.kind === "checking"
              ? "Checking availability…"
              : slugState.kind === "ok"
                ? `Available — your club will live at /${effectiveSlug}`
                : "Lowercase letters, numbers and hyphens. This is your club's URL."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="What is your club about?"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || slugState.kind === "error"}>
          {pending ? "Submitting…" : "Request club"}
        </Button>
        <Link
          href="/clubs"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
