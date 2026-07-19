// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "./sidebar";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/demo-club/dashboard",
}));

const club = { slug: "demo-club", name: "Demo Club", logoUrl: null };
const user = { name: "Amara President", role: "PRESIDENT", status: "ACTIVE" } as const;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.appendChild(container);
});

function render(
  signOut: () => Promise<void>,
  otherClubs: { slug: string; name: string; logoUrl: string | null }[] = [],
) {
  root = createRoot(container);
  act(() => {
    root.render(
      <Sidebar
        club={club}
        user={user}
        otherClubs={otherClubs}
        pendingCount={0}
        signOut={signOut}
      />,
    );
  });
}

/** Finds a clickable element containing the given text, anywhere in the document. */
function byText(text: string): HTMLElement | undefined {
  return Array.from(
    document.querySelectorAll<HTMLElement>("button, a, [role='menuitem']"),
  ).find((el) => el.textContent?.includes(text));
}

/** Whether the text appears anywhere in the document — including non-interactive
 *  nodes like a menu group label, which `byText` deliberately skips. */
function hasText(text: string): boolean {
  return document.body.textContent?.includes(text) ?? false;
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function openUserMenu() {
  const trigger = byText("Amara President");
  expect(trigger, "user menu trigger").toBeTruthy();
  click(trigger!);
}

/**
 * Sign out is the only way out of the app for a user with a single club: /clubs
 * auto-forwards them straight past its own sign-out button, so this menu item is
 * the sole exit. It shipped broken once — handed to Base UI's `render` prop, a
 * <form> that already had a <button> child swallowed the label and drew an empty
 * row — so both its presence and its wiring are pinned here.
 */
describe("Sidebar user menu", () => {
  it("shows a Sign out item with a visible label", () => {
    render(vi.fn());
    openUserMenu();

    expect(
      byText("Sign out"),
      "Sign out item is rendered with its label",
    ).toBeTruthy();
  });

  it("renders the item as a native <button> so the form can submit it", () => {
    render(vi.fn());
    openUserMenu();

    expect(byText("Sign out")!.tagName).toBe("BUTTON");
  });

  it("submits the sign-out action when clicked", async () => {
    const signOut = vi.fn(async () => {});
    render(signOut);
    openUserMenu();

    const signOutItem = byText("Sign out");
    expect(signOutItem).toBeTruthy();
    expect(
      signOutItem!.closest("form"),
      "sits inside the sign-out form",
    ).toBeTruthy();

    click(signOutItem!);
    await act(async () => {});

    expect(signOut, "the server action actually fires").toHaveBeenCalled();
  });
});

/**
 * The switcher is *always* a dropdown (UI-REFACTOR §B2): even with nothing to
 * switch to it carries "Start a new club" and "All clubs", so the trigger is a
 * button, never a plain link. The "Switch club" group — with its label, a Base
 * UI group part that crashes outside a Group — appears only when the user has
 * other clubs, so both branches are exercised here.
 */
describe("Sidebar club switcher", () => {
  const beta = { slug: "beta-club", name: "Beta Club", logoUrl: null };

  it("is a dropdown trigger (not a link), even with nothing to switch to", () => {
    render(vi.fn());

    const trigger = byText("Demo Club");
    expect(trigger, "switcher trigger").toBeTruthy();
    expect(trigger!.tagName).toBe("BUTTON");
    expect(trigger!.getAttribute("href")).toBeNull();

    click(trigger!);

    // No other clubs → no "Switch club" group, just the two standing items.
    expect(hasText("Switch club"), "no group label without other clubs").toBe(false);
    expect(byText("Start a new club")?.getAttribute("href")).toBe("/clubs/new");
    expect(byText("All clubs")?.getAttribute("href")).toBe("/clubs");
  });

  it("opens a menu listing the user's other clubs", () => {
    render(vi.fn(), [beta]);

    const trigger = byText("Demo Club");
    expect(trigger, "switcher trigger").toBeTruthy();
    click(trigger!);

    expect(hasText("Switch club"), "the group label renders").toBe(true);
    const other = byText("Beta Club");
    expect(other, "the other club is listed").toBeTruthy();
    expect(other!.getAttribute("href")).toBe("/beta-club/dashboard");
  });
});
