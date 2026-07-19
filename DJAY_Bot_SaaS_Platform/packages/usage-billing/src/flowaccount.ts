import type {
  AccountingAdapter, AccountingDocument, AccountingProviderEvidence, AccountingSyncResult,
} from "./index";

type FlowAccountMappedDocument = Readonly<{
  documentType: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export interface FlowAccountMappingContract {
  readonly version: string;
  mapDocument(document: AccountingDocument, idempotencyReference: string): FlowAccountMappedDocument;
  parseCreated(documentType: string, raw: unknown): Readonly<{
    externalRecordRef: string; externalDocumentRef: string | null;
  }>;
  parseRetrieved(documentType: string, raw: unknown): AccountingProviderEvidence;
}

type FlowAccountConfig = Readonly<{
  mode: "test" | "live";
  clientId: string;
  clientSecret: string;
  mapping: FlowAccountMappingContract;
  fetchImpl?: typeof fetch;
  now?: () => number;
}>;

const bases = Object.freeze({
  test: "https://openapi.flowaccount.com/test",
  live: "https://openapi.flowaccount.com/v1",
});

function safeCode(raw: unknown, fallback: string) {
  if (!raw || typeof raw !== "object") return fallback;
  const code = (raw as Record<string, unknown>).code;
  return typeof code === "string" || typeof code === "number" ? `flowaccount_${String(code).slice(0, 60)}` : fallback;
}

export function createFlowAccountAdapter(config: FlowAccountConfig): AccountingAdapter {
  if (!config.clientId || !config.clientSecret || !config.mapping.version) {
    throw new Error("flowaccount_configuration_incomplete");
  }
  const fetcher = config.fetchImpl ?? fetch;
  const now = config.now ?? Date.now;
  const baseUrl = bases[config.mode];
  let token: Readonly<{ value: string; expiresAt: number }> | null = null;

  async function accessToken() {
    if (token && token.expiresAt - 60_000 > now()) return token.value;
    const body = new URLSearchParams({ grant_type: "client_credentials", scope: "flowaccount-api",
      client_id: config.clientId, client_secret: config.clientSecret });
    const response = await fetcher(`${baseUrl}/token`, { method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const raw = await response.json() as Record<string, unknown>;
    if (!response.ok || typeof raw.access_token !== "string" || typeof raw.expires_in !== "number") {
      throw new Error("flowaccount_authentication_failed");
    }
    token = Object.freeze({ value: raw.access_token, expiresAt: now() + Math.max(60, raw.expires_in) * 1000 });
    return token.value;
  }

  async function providerRequest(path: string, init: RequestInit = {}) {
    const authorization = await accessToken();
    return fetcher(`${baseUrl}/${path.replace(/^\/+/, "")}`, { ...init,
      headers: { Accept: "application/json", Authorization: `Bearer ${authorization}`, ...init.headers } });
  }

  return Object.freeze({
    async syncDocument(document: AccountingDocument, idempotencyReference: string): Promise<AccountingSyncResult> {
      if (idempotencyReference.length > 36) throw new Error("flowaccount_idempotency_reference_too_long");
      const mapped = config.mapping.mapDocument(document, idempotencyReference);
      try {
        const response = await providerRequest(mapped.documentType, { method: "POST",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(mapped.payload) });
        const raw: unknown = await response.json().catch(() => null);
        if (response.status === 429) return Object.freeze({ outcome: "rate_limited", safeErrorCode: "flowaccount_rate_limited",
          retryAfterMs: 60_000, raw });
        if (!response.ok) return Object.freeze({ outcome: "rejected", safeErrorCode: safeCode(raw, `flowaccount_http_${response.status}`), raw });
        const parsed = config.mapping.parseCreated(mapped.documentType, raw);
        return Object.freeze({ outcome: "succeeded", ...parsed, raw });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("flowaccount_")) throw error;
        return Object.freeze({ outcome: "unknown", safeErrorCode: "flowaccount_network_unknown", retryAfterMs: 30_000,
          raw: { error: "network_unknown" } });
      }
    },

    async retrieveDocument(documentType: string, externalRecordRef: string): Promise<AccountingProviderEvidence> {
      try {
        const response = await providerRequest(`${encodeURIComponent(documentType)}/${encodeURIComponent(externalRecordRef)}`);
        const raw: unknown = await response.json().catch(() => null);
        if (response.status === 404) return Object.freeze({ found: false, externalRecordRef: null,
          externalDocumentRef: null, idempotencyReference: null, providerStatus: null,
          currency: null, totalMinor: null, raw });
        if (response.status === 429) throw new Error("flowaccount_rate_limited");
        if (!response.ok) throw new Error(`flowaccount_http_${response.status}`);
        return Object.freeze(config.mapping.parseRetrieved(documentType, raw));
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("flowaccount_")) throw error;
        throw new Error("flowaccount_network_unknown");
      }
    },
  });
}
