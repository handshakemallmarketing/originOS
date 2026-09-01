import { describe, expect, it } from "vitest";
import { createCocoaLotEnvelope, operatorRoutes, renderOperatorPage } from "./index.js";
describe("SW2-01 Merchant/Cocoa operator shell", () => {
  it("renders every declared route with one active navigation item", () => {
    expect(operatorRoutes.map(({ path }) => path)).toEqual(["/", "/lots", "/transfers", "/workflow", "/system"]);
    for (const route of operatorRoutes) {
      const page = renderOperatorPage(route.path);
      expect(page?.statusCode).toBe(200); expect(page?.contentType).toBe("text/html; charset=utf-8");
      expect(page?.body).toContain(`<title>${route.title} · OriginOS</title>`); expect(page?.body).toContain(`<h1>${route.title}</h1>`);
      expect(page?.body.match(/aria-current="page"/g)).toHaveLength(1); expect(page?.body).toContain('href="#content"'); expect(page?.body).toContain('name="viewport"');
    }
  });
  it("does not claim unknown routes", () => { expect(renderOperatorPage("/not-present")).toBeUndefined(); });
  it("maps the lot form contract to one canonical API v2 command", () => {
    expect(createCocoaLotEnvelope({ lotId: "GH-2026-001", quantityKg: 1250.5, originRef: "originos:farm-ghana-1", custodianRef: "originos:warehouse-1", agentRef: "originos:merchant-1", agencyRef: "originos:agency-cocoa-procurement", authorityRef: "originos:authority-cocoa-procurement", purposeRef: "originos:purpose-conforming-cocoa", evidenceRef: "originos:evidence-cocoa-receipt", attributionRule: "originos:attribution-direct-agent" })).toEqual({
      commandId: "operator-GH-2026-001", agentRef: "originos:merchant-1", agencyRef: "originos:agency-cocoa-procurement", authorityRef: "originos:authority-cocoa-procurement", purposeRef: "originos:purpose-conforming-cocoa", evidenceRefs: ["originos:evidence-cocoa-receipt"], attributionRule: "originos:attribution-direct-agent", command: { commandType: "registerCocoaLot", payload: { lotId: "GH-2026-001", quantityKg: 1250.5, originRef: "originos:farm-ghana-1", custodianRef: "originos:warehouse-1" } }
    });
    const page = renderOperatorPage("/lots")!.body;
    for (const field of ["apiKey", "lotId", "quantityKg", "originRef", "custodianRef", "agentRef", "agencyRef", "authorityRef", "purposeRef", "evidenceRef", "attributionRule"]) expect(page).toContain(`name="${field}"`);
    expect(page).toContain('autocomplete="current-password"'); expect(page).toContain('fetch("/v2/commands"'); expect(page).toContain('fetch("/v2/records"');
    expect(page).not.toContain("localStorage"); expect(page).not.toContain("sessionStorage");
  });
});
