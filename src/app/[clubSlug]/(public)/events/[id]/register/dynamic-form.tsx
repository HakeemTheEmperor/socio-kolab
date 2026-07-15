"use client";

import { useParams } from "next/navigation";
import { useActionState } from "react";
import { CircleCheckBig } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  FIELD_PREFIX,
  TEXT_MAX,
  TEXTAREA_MAX,
  type FormField,
} from "@/lib/event-forms";
import { submitEventRegistrationAction, type RegistrationState } from "./actions";

/** Identity of the person registering, resolved server-side (never trusted). */
export type Identity =
  | { locked: true; name: string; email: string } // ACTIVE member of this club
  | { locked: false; name: string; email: string }; // guest / anonymous (editable)

// Native <select> styled to match Input (§3.3 wants a native control here).
const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export function DynamicForm({
  formSchema,
  identity,
}: {
  formSchema: FormField[];
  identity: Identity;
}) {
  // The club and event are the URL's, never form fields a caller could forge.
  const { clubSlug, id } = useParams<{ clubSlug: string; id: string }>();
  const [state, formAction, pending] = useActionState<RegistrationState, FormData>(
    submitEventRegistrationAction.bind(null, clubSlug, id),
    {},
  );

  if (state.ok) return <RegisteredConfirmation />;

  const fieldError = (key: string) => state.fieldErrors?.[key];

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {/* Honeypot: hidden from people, tempting to bots. A non-empty value is
          silently accepted-and-dropped server-side (§3.3). */}
      <div aria-hidden className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {identity.locked ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <p className="font-medium">Registering as {identity.name}</p>
          <p className="text-muted-foreground">{identity.email}</p>
        </div>
      ) : (
        <>
          <Field label="Name" htmlFor="name" required error={fieldError("name")}>
            <Input
              id="name"
              name="name"
              defaultValue={identity.name}
              required
              maxLength={120}
              autoComplete="name"
              disabled={pending}
            />
          </Field>
          <Field label="Email" htmlFor="email" required error={fieldError("email")}>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={identity.email}
              required
              maxLength={254}
              autoComplete="email"
              disabled={pending}
            />
          </Field>
        </>
      )}

      {formSchema.map((field) => {
        const name = `${FIELD_PREFIX}${field.id}`;
        const error = fieldError(name);

        if (field.type === "checkbox") {
          return (
            <div key={field.id} className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name={name}
                  required={field.required}
                  disabled={pending}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  {field.label}
                  {field.required ? <RequiredMark /> : null}
                </span>
              </label>
              {error ? <ErrorText>{error}</ErrorText> : null}
            </div>
          );
        }

        return (
          <Field
            key={field.id}
            label={field.label}
            htmlFor={name}
            required={field.required}
            error={error}
          >
            <Control field={field} name={name} pending={pending} />
          </Field>
        );
      })}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Submitting…" : "Register"}
      </Button>
    </form>
  );
}

function Control({
  field,
  name,
  pending,
}: {
  field: FormField;
  name: string;
  pending: boolean;
}) {
  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          id={name}
          name={name}
          rows={4}
          maxLength={TEXTAREA_MAX}
          required={field.required}
          disabled={pending}
        />
      );
    case "number":
      return (
        <Input
          id={name}
          name={name}
          type="number"
          inputMode="decimal"
          required={field.required}
          disabled={pending}
        />
      );
    case "select":
      return (
        <select
          id={name}
          name={name}
          required={field.required}
          disabled={pending}
          defaultValue=""
          className={cn(SELECT_CLASS)}
        >
          <option value="" disabled>
            Select…
          </option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    default: // "text"
      return (
        <Input
          id={name}
          name={name}
          type="text"
          maxLength={TEXT_MAX}
          required={field.required}
          disabled={pending}
        />
      );
  }
}

function Field({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      {children}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  );
}

function RequiredMark() {
  return (
    <span className="text-destructive">
      {" *"}
      <span className="sr-only">(required)</span>
    </span>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  );
}

function RegisteredConfirmation() {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <CircleCheckBig aria-hidden className="size-10 text-success" />
      <p className="text-lg font-medium">You&apos;re registered ✓</p>
      <p className="text-sm text-muted-foreground">
        We&apos;ve saved your response. See you there!
      </p>
    </div>
  );
}
