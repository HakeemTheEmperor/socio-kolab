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

function render(signOut: () => Promise<void>) {
  root = createRoot(container);
  act(() => {
    root.render(
      <Sidebar
        club={club}
        user={user}
        otherClubs={[]}
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
