import { z } from "zod";

const localizedRequired = z.object({ th: z.string().trim().min(1).max(10000), en: z.string().trim().min(1).max(10000) }).strict();
const localizedName = z.object({ th: z.string().trim().min(2).max(200), en: z.string().trim().min(2).max(200) }).strict();
const localizedOptional = z.object({ th: z.string().trim().max(300), en: z.string().trim().max(300) }).strict();
const internalActionValue = z.string().trim().regex(/^[a-zA-Z0-9_.:@+-]{1,300}$/);
const actionReference = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["booking", "quotation", "checkout", "contact"]), value: internalActionValue }).strict(),
  z.object({ kind: z.literal("link"), value: z.url().max(2000).refine((value) => new URL(value).protocol === "https:", "https_required") }).strict(),
]);

export const catalogueDraftFieldsSchema = z.object({
  collectionId: z.uuid(), itemKind: z.enum(["product", "service"]),
  externalKey: z.string().trim().regex(/^[a-zA-Z0-9_.-]{1,100}$/),
  categoryKey: z.string().trim().regex(/^[a-zA-Z0-9_.-]{1,100}$/).nullable(),
  localizedName, localizedDescription: localizedRequired,
  priceMinor: z.number().int().min(0).nullable(), currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  localizedPriceText: localizedOptional, availability: z.enum(["available", "unavailable", "seasonal", "contact"]),
  options: z.array(z.record(z.string(), z.unknown())).max(50), actionReference: actionReference.nullable(),
  attributes: z.record(z.string(), z.unknown()),
}).strict();

export const catalogueDraftSchema = catalogueDraftFieldsSchema.refine((value) => (value.priceMinor === null) === (value.currency === null), {
  path: ["priceMinor"], message: "Price and currency are required together.",
});
