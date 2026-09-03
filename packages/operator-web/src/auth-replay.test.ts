import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { renderOperatorPage } from "./index.js";

// Regression test for the reload race: the browser may finish restoring a
// cached OIDC session (and publish "originos:authenticated") before a page's
// own script has had a chance to run and register its listener — this is a
// real ordering hazard per the HTML spec, which performs a microtask
// checkpoint after every synchronously-executed <script> element, so a
// listener registered by a later script can miss an event dispatched by an
// earlier one. `window.originosOnAuthenticated` must therefore be replayable:
// a caller that subscribes after authentication has already completed must
// still be notified, immediately and synchronously, rather than needing a
// future event it can no longer observe.
describe("SW2-01 operator authentication readiness", () => {
  it("delivers persisted lots even when the /lots page script subscribes after authentication has already completed", async () => {
    const config = { issuer: "https://tenant.example.auth0.com", clientId: "web-client", audience: "https://api.originos.app" };
    const page = renderOperatorPage("/lots", config)!;
    const scripts = [...page.body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    expect(scripts).toHaveLength(2);
    const [authScriptBody, lotsScriptBody] = scripts as [string, string];

    const dom = new JSDOM(page.body.replace(/<script>[\s\S]*?<\/script>/g, ""), {
      url: "https://origin-os-nine.vercel.app/lots",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    const { window } = dom;

    const now = Date.now();
    window.sessionStorage.setItem(
      "originos.operator.auth",
      JSON.stringify({ accessToken: "tok123", obtainedAt: now, expiresAt: now + 900000 })
    );
    const fetchCalls: string[] = [];
    (window as unknown as { fetch: typeof fetch }).fetch = (async (input: unknown) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.includes("/v2/records")) {
        return {
          ok: true,
          json: async () => ({
            records: [
              {
                canonicalType: "material-lot",
                canonicalId: "lot-1",
                content: { fixtureId: "GH-2026-TEST-001", quantityKg: 1000, custodianRef: "originos:processor-1" },
              },
            ],
          }),
        };
      }
      throw new Error("unexpected fetch " + url);
    }) as typeof fetch;

    // Restore the cached session first, exactly like the auth script always
    // runs before the page script in document order.
    window.eval(authScriptBody);
    for (let attempt = 0; attempt < 50 && window.document.body.dataset.authenticated !== "true"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(window.document.body.dataset.authenticated).toBe("true");

    // Only now does the page script run and subscribe — the worst case in the
    // real race, where the event would already have been missed.
    window.eval(lotsScriptBody);
    for (let attempt = 0; attempt < 50 && !fetchCalls.includes("/v2/records"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(fetchCalls).toContain("/v2/records");
    const list = window.document.getElementById("lot-list")!;
    for (let attempt = 0; attempt < 50 && !list.textContent?.includes("GH-2026-TEST-001"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(list.innerHTML).toContain("GH-2026-TEST-001");

    dom.window.close();
  });
});
