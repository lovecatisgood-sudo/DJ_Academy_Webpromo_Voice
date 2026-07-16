import { afterEach, describe, expect, it, vi } from "vitest";
import { clearBrowserOneTimeValues, retainBrowserOneTimeValues } from "./browser-one-time-state";

function browser(path: string, stored: Record<string, string> = {}) {
  const url = new URL(path, "https://app.djaybot.test");
  const values = new Map(Object.entries(stored));
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: { pathname: url.pathname, search: url.search, hash: url.hash },
    history: { state: { retained: true }, replaceState },
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  return { replaceState, values };
}

afterEach(() => vi.unstubAllGlobals());

describe("one-time browser state", () => {
  it("retains a fragment token in tab storage and removes it from the address", () => {
    const { replaceState, values } = browser("/verify-email#token=opaque-token");
    expect(retainBrowserOneTimeValues({
      initialValues: { token: "" }, storagePrefix: "djay.verification", cleanPath: "/verify-email",
    })).toEqual({ token: "opaque-token" });
    expect(values.get("djay.verification.token")).toBe("opaque-token");
    expect(replaceState).toHaveBeenCalledWith({ retained: true }, "", "/verify-email");
  });

  it("supports a legacy query value and restores it after a same-tab login", () => {
    const first = browser("/ownership/accept?transferId=transfer&token=legacy-token");
    expect(retainBrowserOneTimeValues({
      initialValues: { transferId: "transfer", token: "legacy-token" },
      storagePrefix: "djay.ownership", cleanPath: "/ownership/accept",
    })).toEqual({ transferId: "transfer", token: "legacy-token" });
    const retained = Object.fromEntries(first.values);
    browser("/ownership/accept", retained);
    expect(retainBrowserOneTimeValues({
      initialValues: { transferId: "", token: "" },
      storagePrefix: "djay.ownership", cleanPath: "/ownership/accept",
    })).toEqual({ transferId: "transfer", token: "legacy-token" });
  });

  it("clears terminal one-time state", () => {
    const { values } = browser("/invitations/accept", { "djay.invitation.token": "opaque-token" });
    clearBrowserOneTimeValues("djay.invitation", ["token"]);
    expect(values.size).toBe(0);
  });
});
