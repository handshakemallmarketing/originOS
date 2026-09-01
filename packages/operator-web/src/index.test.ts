import { describe, expect, it } from "vitest";
import { operatorRoutes, renderOperatorPage } from "./index.js";
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
});
