import { describe, expect, it } from "bun:test";

import { NotConfiguredError } from "../errors";
import { assertMachineCredential, isMachineCredential } from "../credential";

describe("credential::isMachineCredential", () => {
  it("classifies an Org-API-Key as a machine credential", () => {
    expect(isMachineCredential("expys_live_abc123")).toBe(true);
    expect(isMachineCredential("expys_sandbox_abc123")).toBe(true);
  });

  it("classifies a PASETO member token as not a machine credential", () => {
    expect(isMachineCredential("v4.local.abcdef")).toBe(false);
  });

  it("classifies an empty or arbitrary token as not a machine credential", () => {
    expect(isMachineCredential("")).toBe(false);
    expect(isMachineCredential("Expys_live_x")).toBe(false);
  });
});

describe("credential::assertMachineCredential", () => {
  it("does not throw for a machine credential", () => {
    expect(() =>
      assertMachineCredential("expys_live_x", "creditPoints"),
    ).not.toThrow();
  });

  it("throws NotConfiguredError naming the method for a member token", () => {
    try {
      assertMachineCredential("v4.local.x", "creditPoints");
      throw new Error("expected assertMachineCredential to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(NotConfiguredError);
      expect((error as NotConfiguredError).message).toContain("creditPoints");
      expect((error as NotConfiguredError).message).toContain("server-only");
      expect((error as NotConfiguredError).message).toContain("Org-API-Key");
    }
  });
});
