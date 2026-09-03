import { describe, expect, it } from "vitest";
import { renderAuthControls, renderAuthScript } from "./auth.js";

describe("operator browser authentication", () => {
  it("renders explicit Google sign-in and sign-out controls", () => {
    const controls = renderAuthControls();
    expect(controls).toContain("Sign in with Google");
    expect(controls).toContain("Sign out");
  });

  it("uses authorization code with PKCE and never embeds a client secret", () => {
    const script = renderAuthScript({ issuer: "https://tenant.example/", clientId: "public-client", audience: "https://api.example" });
    expect(script).toContain('code_challenge_method:"S256"');
    expect(script).toContain('grant_type:"authorization_code"');
    expect(script).toContain('connection:"google-oauth2"');
    expect(script).toContain('audience:config.audience');
    expect(script).not.toContain("client_secret");
  });

  it("escapes configuration before embedding it in HTML", () => {
    const script = renderAuthScript({ issuer: "https://tenant.example/<script>", clientId: "public-client", audience: "api" });
    expect(script).not.toContain("<script></script>");
    expect(script).toContain("\\u003cscript>");
  });
});
