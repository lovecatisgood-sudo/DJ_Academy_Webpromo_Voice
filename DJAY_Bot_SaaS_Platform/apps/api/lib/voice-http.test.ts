import { describe, expect, it } from "vitest";
import { hasVoiceServiceAuthority } from "./voice-http";

describe("voice internal service authority", () => {
  it("compares only complete bearer credentials and fails closed", () => {
    const token = "voice-service-secret-with-more-than-32-characters";
    expect(hasVoiceServiceAuthority(new Request("https://api.example", { headers: { authorization: `Bearer ${token}` } }), token)).toBe(true);
    expect(hasVoiceServiceAuthority(new Request("https://api.example", { headers: { authorization: "Bearer wrong" } }), token)).toBe(false);
    expect(hasVoiceServiceAuthority(new Request("https://api.example"), token)).toBe(false);
    expect(hasVoiceServiceAuthority(new Request("https://api.example", { headers: { authorization: `Bearer ${token}` } }), undefined)).toBe(false);
  });
});
