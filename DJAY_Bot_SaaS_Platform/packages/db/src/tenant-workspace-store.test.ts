import { describe, expect, it } from "vitest";
import { buildOnboardingChecklist, deriveOnboardingStage } from "./tenant-workspace-store";

describe("server-derived onboarding stage", () => {
  it.each([
    [{ businessProfile: false, productSelected: false, launchReady: false }, "account_created"],
    [{ businessProfile: true, productSelected: false, launchReady: false }, "business_profile"],
    [{ businessProfile: true, productSelected: true, launchReady: false }, "product_selection"],
    [{ businessProfile: true, productSelected: true, launchReady: true }, "ready"],
  ] as const)("derives %s as %s", (readiness, expected) => {
    expect(deriveOnboardingStage(readiness)).toBe(expected);
  });

  it("cannot become ready from product selection without launch evidence", () => {
    expect(deriveOnboardingStage({
      businessProfile: true, productSelected: true, launchReady: false,
    })).not.toBe("ready");
  });
});

describe("server-derived onboarding checklist links", () => {
  it("links incomplete profile and product steps to working destinations", () => {
    const { checklist, primaryAction } = buildOnboardingChecklist({
      businessProfile: false,
      productSelected: false,
      activeAccess: false,
      launchReadyProducts: [],
      productStates: [],
    });
    expect(checklist.find((step) => step.key === "business")).toMatchObject({
      complete: false, nextHref: "/workspace/setup", nextLabel: "Complete profile",
    });
    expect(checklist.find((step) => step.key === "product")).toMatchObject({
      complete: false, nextHref: "/workspace/usage",
    });
    expect(primaryAction).toEqual({ href: "/workspace/setup", label: "Complete profile" });
    expect(checklist.every((step) => step.complete || Boolean(step.nextHref))).toBe(true);
  });

  it("points technical readiness at payment when product awaits activation", () => {
    const { checklist, primaryAction } = buildOnboardingChecklist({
      businessProfile: true,
      productSelected: true,
      activeAccess: false,
      launchReadyProducts: [],
      productStates: [{ productKey: "flowbot", nextAction: "activate" }],
    });
    expect(checklist.find((step) => step.key === "product")).toMatchObject({
      complete: false, nextHref: "/workspace/usage", nextLabel: "Continue to payment",
    });
    expect(checklist.find((step) => step.key === "technical")).toMatchObject({
      complete: false, nextHref: "/workspace/usage",
    });
    expect(primaryAction?.href).toBe("/workspace/usage");
  });

  it("points technical readiness at the product studio for configure/deploy/test", () => {
    const configured = buildOnboardingChecklist({
      businessProfile: true,
      productSelected: true,
      activeAccess: true,
      launchReadyProducts: [],
      productStates: [{ productKey: "ai_chat", nextAction: "configure" }],
    });
    expect(configured.checklist.find((step) => step.key === "technical")).toMatchObject({
      nextHref: "/workspace/ai-chat", nextLabel: "Configure AI Text Bot",
    });
    const tested = buildOnboardingChecklist({
      businessProfile: true,
      productSelected: true,
      activeAccess: true,
      launchReadyProducts: [],
      productStates: [{ productKey: "flowbot", nextAction: "test" }],
    });
    expect(tested.checklist.find((step) => step.key === "technical")).toMatchObject({
      nextHref: "/workspace/setup", nextLabel: "Test Flow Bot",
    });
    const configuredFlow = buildOnboardingChecklist({
      businessProfile: true,
      productSelected: true,
      activeAccess: true,
      launchReadyProducts: [],
      productStates: [{ productKey: "flowbot", nextAction: "configure" }],
    });
    expect(configuredFlow.checklist.find((step) => step.key === "technical")).toMatchObject({
      nextHref: "/workspace/setup", nextLabel: "Configure Flow Bot",
    });
    const deployFlow = buildOnboardingChecklist({
      businessProfile: true,
      productSelected: true,
      activeAccess: true,
      launchReadyProducts: [],
      productStates: [{ productKey: "flowbot", nextAction: "deploy" }],
    });
    expect(deployFlow.checklist.find((step) => step.key === "technical")).toMatchObject({
      nextHref: "/workspace/setup", nextLabel: "Deploy Flow Bot",
    });
  });

  it("omits primary action when launch ready", () => {
    const { checklist, primaryAction } = buildOnboardingChecklist({
      businessProfile: true,
      productSelected: true,
      activeAccess: true,
      launchReadyProducts: ["flowbot"],
      productStates: [{ productKey: "flowbot", nextAction: "operate" }],
    });
    expect(checklist.every((step) => step.complete)).toBe(true);
    expect(primaryAction).toBeNull();
  });
});
