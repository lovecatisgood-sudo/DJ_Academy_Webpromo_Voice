"use client";

import { currentIntlLocale, safeMutationFetch } from "@djay/shared";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { parseStructuredCatalogueCsv } from "../../../lib/structured-catalogue-csv";

type Localized = { th: string; en: string };
type CatalogueItem = {
  id: string; itemKind: "product" | "service"; externalKey: string; categoryKey: string | null;
  localizedName: Localized; localizedDescription: Localized; priceMinor: number | null; currency: string | null;
  localizedPriceText: Localized; availability: "available" | "unavailable" | "seasonal" | "contact";
  options: Record<string, unknown>[]; actionReference: { kind: string; value: string } | null;
  attributes: Record<string, unknown>; status: "draft" | "published" | "published_with_draft" | "archived";
  latestVersion: number; publishedVersion: number | null;
};
type CatalogueAgent = { agentId: string; name: string; businessName: string; bound: boolean };

export function StructuredCataloguePanel(props: Readonly<{ collectionId: string; canWrite: boolean }>) {
  const [items, setItems] = useState<CatalogueItem[]>([]); const [advanced, setAdvanced] = useState(false);
  const [agents, setAgents] = useState<CatalogueAgent[]>([]); const [boundAgentIds, setBoundAgentIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<CatalogueItem | null>(null); const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    if (!props.collectionId) { setItems([]); setAdvanced(false); return; }
    const [response, bindingResponse] = await Promise.all([
      fetch(`/tenant/knowledge/catalog?collectionId=${encodeURIComponent(props.collectionId)}`, { cache: "no-store" }),
      fetch(`/tenant/knowledge/catalog/bindings?collectionId=${encodeURIComponent(props.collectionId)}`, { cache: "no-store" }),
    ]);
    if (!response.ok || !bindingResponse.ok) { setMessage("Catalogue data could not be loaded."); return; }
    const body = await response.json(); const bindings = await bindingResponse.json();
    setItems(body.items || []); setAdvanced(body.capabilities?.structuredCatalogue === true);
    setAgents(bindings.agents || []); setBoundAgentIds((bindings.agents || []).filter((agent: CatalogueAgent) => agent.bound).map((agent: CatalogueAgent) => agent.agentId));
  }, [props.collectionId]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true); setMessage("");
    try {
      const price = String(data.get("priceMinor") || "").trim(); const actionKind = String(data.get("actionKind") || "");
      const actionValue = String(data.get("actionValue") || "").trim();
      const options = JSON.parse(String(data.get("options") || "[]")); const attributes = JSON.parse(String(data.get("attributes") || "{}"));
      const response = await safeMutationFetch("/tenant/knowledge/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        collectionId: props.collectionId, itemKind: data.get("itemKind"), externalKey: data.get("externalKey"),
        categoryKey: String(data.get("categoryKey") || "").trim() || null,
        localizedName: { th: data.get("nameTh"), en: data.get("nameEn") },
        localizedDescription: { th: data.get("descriptionTh"), en: data.get("descriptionEn") },
        priceMinor: price ? Number(price) : null, currency: price ? data.get("currency") : null,
        localizedPriceText: { th: data.get("priceTextTh"), en: data.get("priceTextEn") },
        availability: data.get("availability"), options,
        actionReference: actionKind && actionValue ? { kind: actionKind, value: actionValue } : null, attributes,
      }) });
      if (!response.ok) throw new Error("save_failed");
      setMessage("Draft saved. Customer answers still use the published version until you publish this item.");
      setEditing(null); form.reset(); await load();
    } catch { setMessage("The draft is invalid or could not be saved. Check JSON, bilingual fields, price and action values."); }
    finally { setWorking(false); }
  }

  async function lifecycle(itemId: string, action: "publish" | "archive") {
    if (action === "archive" && !window.confirm("Archive this item and remove it from future catalogue retrieval? Version history will be retained.")) return;
    setWorking(true); setMessage("");
    const response = await safeMutationFetch("/tenant/knowledge/catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, action }) });
    setWorking(false);
    if (!response.ok) { setMessage(`The item could not be ${action === "publish" ? "published" : "archived"}.`); return; }
    setEditing(null); setMessage(action === "publish" ? "Published as a new immutable catalogue revision." : "Archived and removed from future catalogue retrieval."); await load();
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const file = new FormData(form).get("catalogueCsv");
    if (!(file instanceof File) || !file.size) return; setWorking(true); setMessage("");
    try {
      const parsed = parseStructuredCatalogueCsv(await file.text());
      const response = await safeMutationFetch("/tenant/knowledge/catalog/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collectionId: props.collectionId, items: parsed }) });
      if (!response.ok) throw new Error("import_failed");
      form.reset(); setMessage(`${parsed.length} catalogue drafts imported. Review and publish them individually.`); await load();
    } catch (error) { setMessage(error instanceof Error ? `CSV import failed: ${error.message}` : "CSV import failed."); }
    finally { setWorking(false); }
  }

  async function saveBindings() {
    setWorking(true); setMessage("");
    const response = await safeMutationFetch("/tenant/knowledge/catalog/bindings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      collectionId: props.collectionId, agentIds: boundAgentIds,
    }) });
    setWorking(false);
    if (!response.ok) { setMessage("Catalogue-to-agent mapping could not be saved."); return; }
    setMessage("Agent mapping saved. Published catalogue revisions update these agents' drafts; live Bots change only after separate Bot publication."); await load();
  }

  const selected = editing;
  return <section id="knowledge-catalog" className="tool-band"><div className="band-heading"><div><p>Advanced structured guidance</p><h2>Products and services</h2></div><span>{items.length}</span></div>
    {!advanced ? <div className="pending-line"><strong>Structured catalogue requires AI Text Advanced</strong><span>Starter business product/service information remains available through Business profile and approved knowledge sources.</span></div> : null}
    {advanced && props.canWrite ? <>
      <div className="knowledge-form"><div><div><strong>Use this catalogue with selected AI agents</strong><p className="control-copy">Mapping changes draft knowledge pins only. It never publishes a Bot or changes live traffic.</p></div>{agents.map((agent) => <label key={agent.agentId}><input type="checkbox" checked={boundAgentIds.includes(agent.agentId)} onChange={(event) => setBoundAgentIds((current) => event.target.checked ? [...current, agent.agentId] : current.filter((id) => id !== agent.agentId))} /> <span data-no-localize>{agent.name} · {agent.businessName}</span></label>)}{!agents.length ? <p>No AI Text agents are available yet.</p> : null}</div><button type="button" disabled={working} onClick={() => void saveBindings()}>Save agent mapping</button></div>
      <form className="knowledge-form" onSubmit={save} key={selected ? `${selected.id}:${selected.latestVersion}` : "new"}>
        <div><label>Type<select name="itemKind" defaultValue={selected?.itemKind || "product"}><option value="product">Product</option><option value="service">Service</option></select></label><label>Stable reference<input name="externalKey" pattern="[a-zA-Z0-9_.-]{1,100}" defaultValue={selected?.externalKey} readOnly={Boolean(selected)} required /></label><label>Category key<input name="categoryKey" pattern="[a-zA-Z0-9_.-]{1,100}" defaultValue={selected?.categoryKey || ""} /></label></div>
        <div><label>Thai name<input name="nameTh" minLength={2} maxLength={200} defaultValue={selected?.localizedName.th} required /></label><label>English name<input name="nameEn" minLength={2} maxLength={200} defaultValue={selected?.localizedName.en} required /></label></div>
        <div><label>Thai description<textarea name="descriptionTh" rows={4} maxLength={10000} defaultValue={selected?.localizedDescription.th} required /></label><label>English description<textarea name="descriptionEn" rows={4} maxLength={10000} defaultValue={selected?.localizedDescription.en} required /></label></div>
        <div><label>Price in minor units<input name="priceMinor" type="number" min="0" step="1" defaultValue={selected?.priceMinor ?? ""} /></label><label>Currency<select name="currency" defaultValue={selected?.currency || "THB"}><option value="THB">THB</option><option value="USD">USD</option></select></label><label>Availability<select name="availability" defaultValue={selected?.availability || "available"}><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="seasonal">Seasonal</option><option value="contact">Contact merchant</option></select></label></div>
        <div><label>Thai price text<input name="priceTextTh" maxLength={300} defaultValue={selected?.localizedPriceText.th} /></label><label>English price text<input name="priceTextEn" maxLength={300} defaultValue={selected?.localizedPriceText.en} /></label></div>
        <div><label>Customer action<select name="actionKind" defaultValue={selected?.actionReference?.kind || ""}><option value="">No action</option><option value="booking">Booking</option><option value="quotation">Quotation</option><option value="checkout">Checkout</option><option value="contact">Contact</option><option value="link">Approved link</option></select></label><label>Action reference<input name="actionValue" maxLength={2000} defaultValue={selected?.actionReference?.value || ""} /></label></div>
        <label>Options JSON<textarea name="options" rows={3} defaultValue={JSON.stringify(selected?.options || [])} /></label><label>Attributes JSON<textarea name="attributes" rows={3} defaultValue={JSON.stringify(selected?.attributes || {})} /></label>
        <div><button disabled={working}>{selected ? "Save new draft version" : "Create draft"}</button>{selected ? <button type="button" className="secondary-action" onClick={() => setEditing(null)}>Cancel edit</button> : null}</div>
      </form>
      <form className="flowbot-deploy" onSubmit={importCsv}><label>Bulk CSV (maximum 200 rows)<input name="catalogueCsv" type="file" accept=".csv,text/csv" required /></label><button disabled={working}>Import drafts</button></form>
      <p className="control-copy">Required CSV headers: external_key, item_kind, name_th, name_en, description_th, description_en. Optional fields include category_key, price_minor, currency, price text, availability, action fields, options_json and attributes_json.</p>
    </> : null}
    <div className="data-table">{items.map((item) => <div className="data-row" key={item.id}><div><strong data-no-localize>{item.localizedName.th} / {item.localizedName.en}</strong><span data-no-localize>{item.externalKey} · {item.itemKind} · v{item.latestVersion}{item.publishedVersion ? ` / live v${item.publishedVersion}` : " / not published"}</span></div><span>{item.priceMinor === null ? (item.localizedPriceText.th || "Contact for price") : `${item.currency} ${(item.priceMinor / 100).toLocaleString(currentIntlLocale())}`}</span><span>{item.status}</span>{advanced && props.canWrite ? <div><button type="button" className="secondary-action" onClick={() => setEditing(item)} disabled={working}>Edit</button><button type="button" onClick={() => void lifecycle(item.id, "publish")} disabled={working || item.status === "published"}>Publish</button><button type="button" className="secondary-action" onClick={() => void lifecycle(item.id, "archive")} disabled={working || item.status === "archived"}>Archive</button></div> : null}</div>)}</div>
    {message ? <p className="inline-message" role="status">{message}</p> : null}
  </section>;
}
