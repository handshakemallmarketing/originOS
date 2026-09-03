import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { renderOperatorPage } from "./index.js";

// Follow-up to the reload-race fix: /lots already auto-loads persisted
// records as soon as authentication is ready, via
// window.originosOnAuthenticated, instead of requiring a manual click. The
// other four "Load eligible..." forms (custody transfer, processing,
// completion, materialize, value) required a manual button click even for an
// already-authenticated user — pure friction, since the data is available
// the moment the page can make an authenticated request. They now subscribe
// through the same helper, so a returning, already-authenticated user sees
// eligible records without clicking anything.
const config = { issuer: "https://tenant.example.auth0.com", clientId: "web-client", audience: "https://api.originos.app" };

const authenticatedPage = (path: "/transfers" | "/workflow", scriptIndex: number, records: readonly unknown[]) => {
  const page = renderOperatorPage(path, config)!;
  const scripts = [...page.body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]) as string[];
  const dom = new JSDOM(page.body.replace(/<script>[\s\S]*?<\/script>/g, ""), {
    url: "https://origin-os-nine.vercel.app" + path,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const now = Date.now();
  window.sessionStorage.setItem("originos.operator.auth", JSON.stringify({ accessToken: "tok123", obtainedAt: now, expiresAt: now + 900000 }));
  const fetchCalls: string[] = [];
  (window as unknown as { fetch: typeof fetch }).fetch = (async (input: unknown) => {
    const url = String(input);
    fetchCalls.push(url);
    if (url.includes("/v2/records")) return { ok: true, json: async () => ({ records }) };
    throw new Error("unexpected fetch " + url);
  }) as typeof fetch;
  window.eval(scripts[0]!); // real auth script — restores the cached session
  window.eval(scripts[scriptIndex]!);
  return { window, fetchCalls };
};

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 50 && !predicate(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("SW2-01 eligible lots auto-load once authenticated", () => {
  it("custody transfer: loads eligible lots without clicking the button", async () => {
    const records = [{ canonicalType: "material-lot", canonicalId: "lot-1", content: { fixtureId: "GH-2026-TEST-001", quantityKg: 1000, custodianRef: "originos:warehouse-1" } }];
    const { window, fetchCalls } = authenticatedPage("/transfers", 1, records);
    await waitFor(() => fetchCalls.includes("/v2/records"));
    const select = window.document.getElementById("lotRef") as unknown as { options: { length: number; [i: number]: { textContent: string } } };
    expect(select.options.length).toBe(2); // placeholder + the lot, with no click at all
    expect(select.options[1]!.textContent).toBe("GH-2026-TEST-001");
    window.close();
  });

  it("value: shows the eligibility explanation immediately on auto-load, not just after a manual click", async () => {
    const records = [
      {
        canonicalType: "material-lot",
        canonicalId: "lot-processed-1",
        content: { fixtureId: "GH-2026-PROCESSED-001", material: "processed-cocoa", quantityKg: 850, qualityStatus: "accepted", custodianRef: "originos:processor-1" },
      },
    ];
    const { window, fetchCalls } = authenticatedPage("/workflow", 4, records);
    await waitFor(() => fetchCalls.includes("/v2/records"));
    const feedback = window.document.getElementById("value-feedback")!;
    await waitFor(() => feedback.textContent !== "");
    expect(feedback.textContent).toBe("1 accepted lot(s) still need custody transferred to a buyer before Value can be recorded.");
    window.close();
  });

  it("processing: stays quiet on auto-load when eligible lots are found (no unsolicited status text)", async () => {
    const records = [{ canonicalType: "material-lot", canonicalId: "lot-1", content: { fixtureId: "GH-2026-TEST-001", quantityKg: 1000, custodianRef: "originos:warehouse-1" } }];
    const { window, fetchCalls } = authenticatedPage("/workflow", 1, records);
    await waitFor(() => fetchCalls.includes("/v2/records"));
    const select = window.document.getElementById("processingLotRef") as unknown as { options: { length: number } };
    await waitFor(() => select.options.length > 1);
    expect(select.options.length).toBe(2);
    const feedback = window.document.getElementById("processing-feedback")!;
    expect(feedback.textContent).toBe(""); // no "...loaded." noise on a silent auto-load
    window.close();
  });
});
