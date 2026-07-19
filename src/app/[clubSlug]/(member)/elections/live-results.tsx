"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { PositionTally, ResultsTurnout } from "@/lib/elections";
import { ResultsView } from "./results-view";

type TalliesPayload = {
  phase: string;
  turnout: ResultsTurnout;
  tallies: PositionTally[];
};

const POLL_MS = 7000;

/**
 * Live tally view during voting. Polls the tallies route (a GET JSON handler)
 * every 7s — well inside the ≤10s freshness target — pausing while the tab is
 * hidden. When the payload reports voting has closed it stops polling and
 * refreshes the route so the page re-renders in its closed state.
 */
export function LiveResults({
  electionId,
  initial,
}: {
  electionId: string;
  initial: TalliesPayload;
}) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [data, setData] = useState<TalliesPayload>(initial);
  // Avoid a stale closure re-scheduling after the phase flips to closed.
  const closedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const url = `/${clubSlug}/elections/${electionId}/tallies`;

    async function poll() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const next = (await res.json()) as TalliesPayload;
        if (cancelled) return;
        setData(next);
        if (next.phase !== "voting") {
          closedRef.current = true;
          router.refresh();
        }
      } catch {
        // Transient failure — the next tick retries.
      }
    }

    const id = setInterval(() => {
      if (!closedRef.current) void poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [clubSlug, electionId, router]);

  return <ResultsView tallies={data.tallies} turnout={data.turnout} live />;
}
