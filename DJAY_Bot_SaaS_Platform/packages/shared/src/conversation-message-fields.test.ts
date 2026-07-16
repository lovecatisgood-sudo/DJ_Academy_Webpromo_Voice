import { describe, expect, it } from "vitest";
import {
  conversationMessageTextError,
  conversationMessageTextLimits,
  conversationMessageTextSchema,
  normalizeConversationMessageText,
} from "./conversation-message-fields";

describe("conversation message text contract", () => {
  it("publishes and enforces the canonical text boundary", () => {
    expect(conversationMessageTextLimits).toEqual({ minLength: 1, maxLength: 20_000 });
    expect(conversationMessageTextSchema.safeParse("   ").success).toBe(false);
    expect(conversationMessageTextSchema.safeParse("x".repeat(20_001)).success).toBe(false);
  });

  it("normalizes usable text and returns browser-safe correction guidance", () => {
    expect(normalizeConversationMessageText("  We can help.  ")).toBe("We can help.");
    expect(conversationMessageTextSchema.parse("  We can help.  ")).toBe("We can help.");
    expect(conversationMessageTextError("   ")).toBe("Write a reply with at least one visible character.");
    expect(conversationMessageTextError("We can help.")).toBeNull();
  });
});
