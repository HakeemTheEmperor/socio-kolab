// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";

import { TOPBAR_ACTIONS_ID, TopbarActions } from "./topbar-actions";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
});

/**
 * The topbar's action slot is the one piece of the shell that server-rendered
 * HTML cannot show, because it only exists after hydration. If this breaks, an
 * exec silently loses "Create event" — so it gets a test.
 */
describe("TopbarActions", () => {
  it("portals its children into the topbar slot", () => {
    const slot = document.createElement("div");
    slot.id = TOPBAR_ACTIONS_ID;
    const page = document.createElement("div");
    document.body.append(slot, page);

    act(() => {
      createRoot(page).render(
        <TopbarActions>
          <button type="button">Create event</button>
        </TopbarActions>,
      );
    });

    expect(slot.textContent).toBe("Create event");
    // It renders into the topbar, not where the page put it.
    expect(page.textContent).toBe("");
  });

  it("renders nothing when the shell has no slot (e.g. a page outside it)", () => {
    const page = document.createElement("div");
    document.body.append(page);

    act(() => {
      createRoot(page).render(
        <TopbarActions>
          <button type="button">Create event</button>
        </TopbarActions>,
      );
    });

    expect(document.body.textContent).toBe("");
  });
});
