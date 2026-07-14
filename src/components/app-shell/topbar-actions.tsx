"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export const TOPBAR_ACTIONS_ID = "topbar-actions";

const noop = () => () => {};

/**
 * Renders a page's contextual primary action into the topbar (UI-REFACTOR §B4).
 *
 * The topbar lives in the layout and the action belongs to the page, so the page
 * portals into it. The alternative — hoisting the controls into the layout —
 * would mean the layout re-fetching each page's data (the dues period list, the
 * CSV rows) just to render a button.
 *
 * It mounts client-side, so the action appears on hydration rather than in the
 * server HTML. That is fine for a button nobody can click before hydration
 * anyway, and it keeps every page a server component.
 */
export function TopbarActions({ children }: { children: React.ReactNode }) {
  // The slot only exists in the DOM, so nothing can render until the client has
  // mounted. `useSyncExternalStore` is how you say "client only" without a
  // setState-in-effect, which the React Compiler rules (rightly) reject.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!mounted) return null;

  const slot = document.getElementById(TOPBAR_ACTIONS_ID);
  return slot ? createPortal(children, slot) : null;
}
