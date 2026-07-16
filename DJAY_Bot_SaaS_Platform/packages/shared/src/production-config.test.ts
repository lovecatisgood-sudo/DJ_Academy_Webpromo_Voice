import { describe, expect, it } from "vitest";
import { assertNoProductionPlaceholders } from "./production-config";

describe("production configuration admission", () => {
  it.each([
    ["database password", "postgresql://runtime:change-me@database:5432/djay"],
    ["example secret", "base64-encoded-32-byte-secret"],
    ["replacement token", "replace-with-independent-service-token"],
    ["reserved endpoint", "https://gateway.example.test/v1/generate"],
    ["nested reserved endpoint", "https://api.example-email.test/v1/messages"],
    ["unversioned release", "local-unreleased"],
  ])("rejects a copied %s without disclosing its value", (_case, value) => {
    expect(() => assertNoProductionPlaceholders("production", { SENSITIVE_VALUE: value }))
      .toThrow("SENSITIVE_VALUE contains an example value");
  });

  it("accepts reviewed production-shaped values", () => {
    expect(() => assertNoProductionPlaceholders("production", {
      DATABASE_URL: "postgresql://runtime:opaque-secret@database:5432/djay",
      SERVICE_TOKEN: "a-reviewed-independent-service-token-2026",
      RELEASE_VERSION: "88229be",
      ENDPOINT: "https://gateway.djaybot.com/v1/generate",
    })).not.toThrow();
  });

  it("does not restrict local fixtures outside production", () => {
    expect(() => assertNoProductionPlaceholders("development", {
      DATABASE_URL: "postgresql://runtime:change-me@localhost:5432/djay",
      ENDPOINT: "https://gateway.example.test/v1/generate",
    })).not.toThrow();
  });
});
