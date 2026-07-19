import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

const metadataSchema = z.object({
  tags: z.array(z.object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,63}$/),
    label: z.string().trim().min(1).max(80),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  }).strict()).max(50),
  attributes: z.array(z.object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,63}$/),
    label: z.string().trim().min(1).max(80),
    valueType: z.enum(["text", "number", "boolean", "date"]),
    value: z.string().trim().min(1).max(2000),
  }).strict()).max(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.tags.map((tag) => tag.key)).size !== value.tags.length) context.addIssue({ code: "custom", message: "duplicate_tag_key" });
  if (new Set(value.attributes.map((attribute) => attribute.key)).size !== value.attributes.length) context.addIssue({ code: "custom", message: "duplicate_attribute_key" });
  for (const attribute of value.attributes) {
    const valid = attribute.valueType === "text"
      || (attribute.valueType === "number" && /^-?[0-9]+(\.[0-9]+)?$/.test(attribute.value))
      || (attribute.valueType === "boolean" && ["true", "false"].includes(attribute.value))
      || (attribute.valueType === "date" && /^\d{4}-\d{2}-\d{2}$/.test(attribute.value));
    if (!valid) context.addIssue({ code: "custom", path: ["attributes", attribute.key, "value"], message: "invalid_typed_value" });
  }
});

export async function PUT(request: NextRequest, context: { params: Promise<{ contactId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "contacts.write") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const { contactId } = await context.params;
    const result = await resolved.services.sharedDomain.updateContactMetadata(resolved.context, z.string().uuid().parse(contactId), metadataSchema.parse(await readJson(request)));
    return safeJson(result, result.status === "updated" ? 200 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
