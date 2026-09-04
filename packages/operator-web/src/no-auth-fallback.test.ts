import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { renderOperatorPage } from "./index.js";

// Regression test: packages/service-runtime/src/index.ts (the self-hosted,
// non-Vercel entry point) renders operator-web pages via `operatorWebApp`,
// which calls renderOperatorPage(pathname) with NO authConfig — a real,
// exercised deployment mode distinct from the Auth0-gated Vercel path. Every
// page script calls `window.originosOnAuthenticated(callback)`
// unconditionally, expecting auth.ts's real script to have defined it. When
// no authConfig is supplied, renderAuthScript is never emitted, so without a
// fallback that call throws a top-level TypeError — which aborts the rest of
// the page's synchronous script, silently breaking every event listener
// declared after it (e.g. the "Register cocoa lot" submit handler on
// /lots never attaches at all). renderReadyFallbackScript must keep every
// page functional when no OIDC gate applies.
describe("SW2-01 operator pages without an OIDC gate", () => {
  it("still wires up the /lots registration form when no authConfig is supplied", async () => {
    const page = renderOperatorPage("/lots")!; // self-hosted mode: no authConfig
    const scripts = [...page.body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    expect(scripts).toHaveLength(2); // the ready-fallback script, plus the page script

    const dom = new JSDOM(page.body.replace(/<script>[\s\S]*?<\/script>/g, ""), {
      url: "http://localhost/lots",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    const { window } = dom;
    const fetchCalls: string[] = [];
    (window as unknown as { fetch: typeof fetch }).fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.includes("/v2/records")) return { ok: true, json: async () => ({ records: [] }) };
      if (url.includes("/v2/commands")) return { ok: true, json: async () => ({ ok: true }) };
      throw new Error("unexpected fetch " + url + JSON.stringify(init));
    }) as typeof fetch;

    // Run both scripts in document order, exactly as the browser would.
    // No script should throw during this (a throw would leave fetchCalls
    // empty, since the auto-load call would never have run).
    for (const script of scripts) window.eval(script!);
    for (let attempt = 0; attempt < 50 && !fetchCalls.includes("/v2/records"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(fetchCalls).toContain("/v2/records");

    // The submit handler must have attached — fill the form and submit it.
    const form = window.document.getElementById("lot-form") as unknown as { elements: Record<string, { value: string }> };
    form.elements.apiKey!.value = "legacy-key";
    form.elements.lotId!.value = "GH-2026-LEGACY-001";
    form.elements.quantityKg!.value = "10";
    (window.document.querySelector('#lot-form button[type="submit"]') as unknown as { click(): void }).click();

    for (let attempt = 0; attempt < 50 && !fetchCalls.includes("/v2/commands"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(fetchCalls).toContain("/v2/commands");

    window.close();
  });
});
