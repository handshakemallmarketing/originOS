import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { renderOperatorPage } from "./index.js";

// Regression test for the "unclickable lots" usability gap found in
// production testing: persisted-record lists were plain, dead-end text with
// no way to act on a specific record — the user had to remember its id and
// re-select it from a separate dropdown on another page. Clicking a lot on
// /lots now navigates to /transfers with that lot pre-selected via a
// `?lotRef=` query param (not sessionStorage/localStorage — the page
// scripts are asserted never to touch persistent client storage).
const config = { issuer: "https://tenant.example.auth0.com", clientId: "web-client", audience: "https://api.originos.app" };

describe("SW2-01 clicking a persisted lot hands it off to the next workflow", () => {
  it("/lots: each persisted lot is keyboard-and-click actionable and links to /transfers?lotRef=<id>", async () => {
    const page = renderOperatorPage("/lots", config)!;
    const scripts = [...page.body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]) as string[];
    const dom = new JSDOM(page.body.replace(/<script>[\s\S]*?<\/script>/g, ""), {
      url: "https://origin-os-nine.vercel.app/lots",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    const { window } = dom;
    const now = Date.now();
    window.sessionStorage.setItem("originos.operator.auth", JSON.stringify({ accessToken: "tok123", obtainedAt: now, expiresAt: now + 900000 }));
    (window as unknown as { fetch: typeof fetch }).fetch = (async (input: unknown) => {
      const url = String(input);
      if (url.includes("/v2/records")) {
        return {
          ok: true,
          json: async () => ({
            records: [{ canonicalType: "material-lot", canonicalId: "lot-1", content: { fixtureId: "GH-2026-TEST-001", quantityKg: 1000, custodianRef: "originos:warehouse-1" } }],
          }),
        };
      }
      throw new Error("unexpected fetch " + url);
    }) as typeof fetch;

    window.eval(scripts[0]!);
    window.eval(scripts[1]!);

    const list = window.document.getElementById("lot-list")!;
    for (let attempt = 0; attempt < 50 && !list.querySelector(".lot"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const item = list.querySelector(".lot") as unknown as { getAttribute(name: string): string | null; tabIndex: number; click(): void };
    expect(item.getAttribute("role")).toBe("button");
    expect(item.tabIndex).toBe(0);

    // jsdom deliberately does not implement cross-document navigation (its
    // Location object is non-configurable, matching the browser spec's
    // "unforgeable" semantics), so an actual window.location change after
    // item.click() cannot be observed here. The click handler itself is
    // still exercised for real (confirming it doesn't throw); the exact
    // navigation target is pinned against the compiled script source below,
    // consistent with this repo's existing convention for asserting on
    // embedded script content (see auth.test.ts).
    expect(() => item.click()).not.toThrow();
    expect(scripts[1]).toContain('location.assign("/transfers?lotRef="+encodeURIComponent(record.canonicalId))');

    window.close();
  });

  it("/transfers: a lotRef query param pre-selects the matching lot and clears itself from the URL", async () => {
    const page = renderOperatorPage("/transfers", config)!;
    const scripts = [...page.body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]) as string[];
    const dom = new JSDOM(page.body.replace(/<script>[\s\S]*?<\/script>/g, ""), {
      url: "https://origin-os-nine.vercel.app/transfers?lotRef=lot-1",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    const { window } = dom;
    const now = Date.now();
    window.sessionStorage.setItem("originos.operator.auth", JSON.stringify({ accessToken: "tok123", obtainedAt: now, expiresAt: now + 900000 }));
    (window as unknown as { fetch: typeof fetch }).fetch = (async (input: unknown) => {
      const url = String(input);
      if (url.includes("/v2/records")) {
        return {
          ok: true,
          json: async () => ({
            records: [{ canonicalType: "material-lot", canonicalId: "lot-1", content: { fixtureId: "GH-2026-TEST-001", quantityKg: 1000, custodianRef: "originos:warehouse-1" } }],
          }),
        };
      }
      throw new Error("unexpected fetch " + url);
    }) as typeof fetch;

    window.eval(scripts[0]!);
    window.eval(scripts[1]!);

    const select = window.document.getElementById("lotRef") as unknown as { value: string };
    for (let attempt = 0; attempt < 50 && select.value !== "lot-1"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(select.value).toBe("lot-1");
    expect((window.document.getElementById("quantityKg") as unknown as { value: string }).value).toBe("1000");
    expect((window.document.getElementById("fromCustodianRef") as unknown as { value: string }).value).toBe("originos:warehouse-1");
    expect(window.location.search).toBe(""); // the one-time handoff param is cleared

    window.close();
  });
});
