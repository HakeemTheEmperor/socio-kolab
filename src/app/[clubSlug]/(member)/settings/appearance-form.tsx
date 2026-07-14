"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Calendar, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_THEME, generateTheme, validateTheme } from "@/lib/theme";
import type { ThemeColors } from "@/lib/theme";
import { updateTheme } from "./actions";

const FIELDS = [
  { key: "background", label: "Background" },
  { key: "primary", label: "Primary" },
  { key: "accent", label: "Accent" },
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

/** A native color well plus a hex field, each writing the same value. */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `color-${label.toLowerCase()}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          // The color well only speaks valid hex; while the text field holds a
          // half-typed value it keeps showing the last good one.
          value={HEX.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          spellCheck={false}
          className="font-mono"
          aria-label={`${label} hex`}
        />
      </div>
    </div>
  );
}

/**
 * A miniature of the app rendered with the candidate colors: sidebar sliver, a
 * stat card, a primary button, and the paid/unpaid pair — the four things a
 * president needs to see before committing (§A6).
 *
 * It sets the generated tokens as CSS variables on its own wrapper, so everything
 * inside is styled by exactly the same token utilities the real pages use. There
 * is no preview-specific styling to drift out of sync.
 */
function Preview({ colors }: { colors: ThemeColors }) {
  const tokens = generateTheme(colors.background, colors.primary, colors.accent);

  return (
    <div
      style={tokens as React.CSSProperties}
      className="overflow-hidden rounded-xl border border-border bg-background"
    >
      <div className="flex min-h-56">
        <div className="w-24 shrink-0 space-y-1.5 border-r border-border bg-surface p-2">
          <div className="rounded-md bg-primary-tint px-2 py-1.5 text-[11px] font-medium text-primary-tint-fg">
            Dashboard
          </div>
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Members</div>
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Dues</div>
        </div>

        <div className="flex-1 space-y-3 p-3">
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Active members</span>
              <span className="grid size-6 place-items-center rounded-md bg-primary-tint">
                <Calendar
                  aria-hidden
                  strokeWidth={1.75}
                  className="size-3.5 text-primary-tint-fg"
                />
              </span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-foreground">128</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Paid</Badge>
            <Badge variant="danger">Unpaid</Badge>
            <span className="rounded-md bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand-tint-fg">
              Accent
            </span>
          </div>

          <button
            type="button"
            tabIndex={-1}
            className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-fg"
          >
            Record payment
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppearanceForm({ theme }: { theme: ThemeColors }) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [colors, setColors] = useState<ThemeColors>(theme);

  const malformed = FIELDS.filter(({ key }) => !HEX.test(colors[key]));
  const validation = validateTheme(colors.background, colors.primary, colors.accent);
  // A half-typed hex is not a contrast failure — don't shout about legibility
  // until there is something to judge.
  const blocked = malformed.length > 0 || !validation.ok;
  const messages = malformed.length
    ? malformed.map(({ label }) => `${label} must be a hex color like #4F46E5.`)
    : validation.warnings;

  function save() {
    startTransition(async () => {
      const result = await updateTheme(clubSlug, colors);
      if (result.ok) {
        toast.success("Appearance saved.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await updateTheme(clubSlug, null);
      if (result.ok) {
        setColors(DEFAULT_THEME);
        toast.success("Reset to the default theme.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {FIELDS.map(({ key, label }) => (
          <ColorField
            key={key}
            label={label}
            value={colors[key]}
            onChange={(value) => setColors((c) => ({ ...c, [key]: value }))}
          />
        ))}

        {messages.length > 0 ? (
          <ul className="space-y-1.5" role="alert">
            {messages.map((message) => (
              <li
                key={message}
                className={`flex gap-2 text-[13px] ${
                  blocked ? "text-danger-tint-fg" : "text-warning-tint-fg"
                }`}
              >
                <TriangleAlert
                  aria-hidden
                  strokeWidth={1.75}
                  className="mt-px size-4 shrink-0"
                />
                <span>{message}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={pending || blocked}>
            {pending ? "Saving…" : "Save appearance"}
          </Button>
          <Button variant="outline" onClick={reset} disabled={pending}>
            Reset to default
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] text-muted-foreground">Preview</p>
        <Preview colors={colors} />
      </div>
    </div>
  );
}
