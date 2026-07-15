"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Copy the public registration URL for an event (EVENT-FORMS.md §3.4) — the link
 * clubs blast to WhatsApp. The path is derived from the URL's club slug.
 */
export function CopyRegisterLink({ eventId }: { eventId: string }) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const [copied, setCopied] = useState(false);
  const path = `/${clubSlug}/events/${eventId}/register`;

  async function copy() {
    const url =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn’t copy the link.");
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      {copied ? "Copied" : "Copy register link"}
    </Button>
  );
}
