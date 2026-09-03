import { describe, expect, it } from "vitest";
import { JSDOM, type DOMWindow } from "jsdom";
import { renderOperatorPage } from "./index.js";

// Regression tests for a real usability gap found in production testing:
// every "Load eligible…" control in this app applies a nontrivial,
// multi-condition filter (custody state, quality status, already-consumed
// checks) and silently omits records that don't qualify, with zero
// indication of *why* — a canonical processed lot can look "missing" from a
// dropdown even though it is sitting right there in `/v2/records`. This was
// hit live: `GH-2026-PROCESSED-001` did not appear in the Value workflow's
// "delivered processed lot" dropdown because it had not yet been
// custody-transferred to a buyer, and the only clue was one line of small
// print easy to miss. Each "Load…" flow must instead explain the reason
// when the eligible list comes back empty.

const config = { issuer: "https://tenant.example.auth0.com", clientId: "web-client", audience: "https://api.originos.app" };

const setUpPage = (path: "/transfers" | "/workflow", scriptIndex: number, records: readonly unknown[]) => {
  const page = renderOperatorPage(path, config)!;
  const scripts = [...page.body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]) as string[];
  const dom = new JSDOM(page.body.replace(/<script>[\s\S]*?<\/script>/g, ""), {
    url: "https://origin-os-nine.vercel.app" + path,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  (dom.window as unknown as { fetch: typeof fetch }).fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.includes("/v2/records")) return { ok: true, json: async () => ({ records }) };
    throw new Error("unexpected fetch " + url);
  }) as typeof fetch;
  dom.window.eval(scripts[scriptIndex]!);
  return dom.window;
};

const clickAndAwaitFeedback = async (window: DOMWindow, buttonId: string, feedbackId: string): Promise<string> => {
  const button = window.document.getElementById(buttonId) as unknown as { click(): void };
  const feedback = window.document.getElementById(feedbackId)!;
  button.click();
  const loadingText = feedback.textContent; // set synchronously by the click handler before any await
  for (let attempt = 0; attempt < 50 && feedback.textContent === loadingText; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return feedback.textContent ?? "";
};

describe("SW2-01 eligible-lot loading explains empty results", () => {
  it("custody transfer: explains when no cocoa lots are registered yet", async () => {
    const window = setUpPage("/transfers", 1, []);
    const text = await clickAndAwaitFeedback(window, "load-transfer-lots", "transfer-feedback");
    expect(text).toBe("No cocoa lots are registered yet — register one on the Cocoa lots page first.");
    window.close();
  });

  it("processing: explains when every registered lot already has processing initiated", async () => {
    const records = [
      { canonicalType: "material-lot", canonicalId: "lot-1", content: { fixtureId: "GH-2026-TEST-001", quantityKg: 1000, custodianRef: "originos:warehouse-1" } },
      { canonicalType: "transformation", canonicalId: "tf-1", content: { workflowId: "GH-2026-PROCESS-001", lotRef: "lot-1", processorRef: "originos:processor-1", initiationStatus: "initiated" } },
    ];
    const window = setUpPage("/workflow", 1, records);
    const text = await clickAndAwaitFeedback(window, "load-processing-lots", "processing-feedback");
    expect(text).toBe("1 registered lot(s) already have processing initiated.");
    window.close();
  });

  it("completion: explains when no processing workflows have been initiated yet", async () => {
    const window = setUpPage("/workflow", 2, []);
    const text = await clickAndAwaitFeedback(window, "load-transformations", "completion-feedback");
    expect(text).toBe("No processing workflows have been initiated yet — initiate one on this page first.");
    window.close();
  });

  it("materialize: explains when no processing workflows have completed yet", async () => {
    const window = setUpPage("/workflow", 3, []);
    const text = await clickAndAwaitFeedback(window, "load-completions", "processed-lot-feedback");
    expect(text).toBe("No processing workflows have completed yet — complete one on this page first.");
    window.close();
  });

  it("value: explains that an accepted processed lot needs a delivery transfer first — the exact scenario hit in production", async () => {
    // GH-2026-PROCESSED-001 exists, is accepted, but has never been
    // custody-transferred to a buyer — reproduces the live report.
    const records = [
      {
        canonicalType: "material-lot",
        canonicalId: "lot-processed-1",
        content: { fixtureId: "GH-2026-PROCESSED-001", material: "processed-cocoa", quantityKg: 850, qualityStatus: "accepted", custodianRef: "originos:processor-1" },
      },
    ];
    const window = setUpPage("/workflow", 4, records);
    const text = await clickAndAwaitFeedback(window, "load-deliveries", "value-feedback");
    expect(text).toBe("1 accepted lot(s) still need custody transferred to a buyer before Value can be recorded.");
    const select = window.document.getElementById("processedLotRef") as unknown as { options: { length: number } };
    expect(select.options.length).toBe(1); // only the placeholder — nothing eligible
    window.close();
  });

  it("value: explains when an accepted, delivered lot already has a Value status recorded", async () => {
    const records = [
      {
        canonicalType: "material-lot",
        canonicalId: "lot-processed-1",
        content: { fixtureId: "GH-2026-PROCESSED-001", material: "processed-cocoa", quantityKg: 850, qualityStatus: "accepted", custodianRef: "originos:processor-1" },
      },
      { canonicalType: "custody-transfer", canonicalId: "xfer-1", content: { lotRef: "lot-processed-1", fromCustodianRef: "originos:processor-1", toCustodianRef: "originos:buyer-1", quantityKg: 850 } },
      { canonicalType: "value-status", canonicalId: "value-1", content: { processedLotRef: "lot-processed-1", realizationStatus: "realized", considerationStatus: "settled" } },
    ];
    const window = setUpPage("/workflow", 4, records);
    const text = await clickAndAwaitFeedback(window, "load-deliveries", "value-feedback");
    expect(text).toBe("1 lot(s) already have a Value status recorded.");
    window.close();
  });

  it("value: shows the normal success message, not an explanation, once a lot is actually eligible", async () => {
    const records = [
      {
        canonicalType: "material-lot",
        canonicalId: "lot-processed-1",
        content: { fixtureId: "GH-2026-PROCESSED-001", material: "processed-cocoa", quantityKg: 850, qualityStatus: "accepted", custodianRef: "originos:processor-1" },
      },
      { canonicalType: "custody-transfer", canonicalId: "xfer-1", content: { lotRef: "lot-processed-1", fromCustodianRef: "originos:processor-1", toCustodianRef: "originos:buyer-1", quantityKg: 850 } },
    ];
    const window = setUpPage("/workflow", 4, records);
    const text = await clickAndAwaitFeedback(window, "load-deliveries", "value-feedback");
    expect(text).toBe("Delivered lots and Value statuses loaded.");
    const select = window.document.getElementById("processedLotRef") as unknown as { options: { length: number } };
    expect(select.options.length).toBe(2); // placeholder + the eligible lot
    window.close();
  });
});
