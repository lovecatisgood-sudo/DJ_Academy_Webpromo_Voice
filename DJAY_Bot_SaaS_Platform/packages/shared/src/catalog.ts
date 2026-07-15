import { z } from "zod";

export const publicPlanKeys = [
  "flowbot_basic",
  "flowbot_premium",
  "ai_chat_basic",
  "ai_chat_premium",
  "voice_basic_gen1",
  "voice_advanced_gen2",
] as const;

export const publicPlanKeySchema = z.enum(publicPlanKeys);
export type PublicPlanKey = z.infer<typeof publicPlanKeySchema>;

export const productKeys = ["flowbot", "ai_chat", "voice"] as const;
export const productKeySchema = z.enum(productKeys);
export type ProductKey = z.infer<typeof productKeySchema>;

export const voiceCapabilityProfiles = ["voice_gen1", "voice_gen2"] as const;
export const voiceCapabilityProfileSchema = z.enum(voiceCapabilityProfiles);
export type VoiceCapabilityProfile = z.infer<typeof voiceCapabilityProfileSchema>;

export const productForPlan: Readonly<Record<PublicPlanKey, ProductKey>> = {
  flowbot_basic: "flowbot",
  flowbot_premium: "flowbot",
  ai_chat_basic: "ai_chat",
  ai_chat_premium: "ai_chat",
  voice_basic_gen1: "voice",
  voice_advanced_gen2: "voice",
};

