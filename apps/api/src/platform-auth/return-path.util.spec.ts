import { sanitizeReturnPath } from "./return-path.util";

describe("sanitizeReturnPath", () => {
  it("returns undefined for empty input", () => {
    expect(sanitizeReturnPath(undefined)).toBeUndefined();
    expect(sanitizeReturnPath(null)).toBeUndefined();
    expect(sanitizeReturnPath("   ")).toBeUndefined();
  });

  it("allows simple relative paths", () => {
    expect(sanitizeReturnPath("/")).toBe("/");
    expect(sanitizeReturnPath("/dashboard")).toBe("/dashboard");
    expect(sanitizeReturnPath("/challenges/abc?tab=overview")).toBe("/challenges/abc?tab=overview");
  });

  it("decodes encoded payloads before validating", () => {
    expect(sanitizeReturnPath("%2Fprofile%3Ftab%3Dsessions")).toBe("/profile?tab=sessions");
  });

  it("rejects protocol-relative or absolute URLs", () => {
    expect(sanitizeReturnPath("//evil.com")).toBeUndefined();
    expect(sanitizeReturnPath("https://evil.com")).toBeUndefined();
  });

  it("rejects javascript URLs", () => {
    expect(sanitizeReturnPath("javascript:alert(1)")).toBeUndefined();
  });
});

