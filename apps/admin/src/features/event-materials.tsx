"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";

interface Material {
  id: string; event_id: string; kind: "gallery" | "resource"; label: string;
  url: string; published: boolean; display_order: number;
}
const blank = { id: "", label: "", kind: "resource" as Material["kind"], url: "", published: false, display_order: 0 };

function materialError(failure: unknown) {
  const message = workflowError(failure);
  if (message.includes("INVALID_EVENT_MATERIAL")) return "Use a label of 1–160 characters, a valid HTTPS URL and a whole-number display order. Gallery links must point to a Google Photos album.";
  if (message.includes("MATERIAL_UNAVAILABLE")) return "This link is no longer available for this event. Refresh links and try again.";
  if (message.includes("EVENT_UNAVAILABLE")) return "This event is no longer available. Return to events and select it again.";
  return message;
}

export function AdminEventMaterials() {
  const { eventId } = useParams<{ eventId: string }>();
  const { client, session } = useIdentity();
  const [rows, setRows] = useState<Material[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    if (!client || !session) return;
    setLoading(true); setError(""); setTitle(null); setRows([]);
    void Promise.all([
      client.from("events").select("title").eq("id", eventId).maybeSingle(),
      client.from("event_materials").select("id,event_id,kind,label,url,published,display_order")
        .eq("event_id", eventId).order("display_order").order("id"),
    ]).then(([event, materials]) => {
      if (event.error) throw event.error;
      if (materials.error) throw materials.error;
      if (active) { setTitle(event.data?.title ?? null); setRows((materials.data ?? []) as Material[]); }
    }).catch((failure: unknown) => { if (active) setError(workflowError(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, session, eventId, version]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!client || busy) return;
    setBusy(true); setSaveError(""); setMessage("");
    try {
      const result = await client.rpc("admin_save_event_material", {
        p_event_id: eventId, p_id: form.id || null, p_label: form.label.trim(), p_kind: form.kind,
        p_url: form.url.trim(), p_published: form.published, p_display_order: form.display_order,
      });
      if (result.error) throw result.error;
      setMessage(form.id ? "Link updated." : "Link added."); setForm(blank);
      setVersion((v) => v + 1);
    } catch (failure) { setSaveError(materialError(failure)); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!client || busy) return;
    setBusy(true); setSaveError(""); setMessage("");
    try {
      const result = await client.rpc("admin_delete_event_material", { p_event_id: eventId, p_id: id });
      if (result.error) throw result.error;
      if (form.id === id) setForm(blank);
      setRemoving(null); setMessage("Link removed."); setVersion((v) => v + 1);
    } catch (failure) { setSaveError(materialError(failure)); }
    finally { setBusy(false); }
  }

  return <section className="workflow-section">
    <Link href="/events">Back to events</Link>
    <h1>Gallery & resources</h1>
    <p>External sharing is controlled by the file or album owner. Check access before publishing; anyone-with-link materials can be forwarded. Use approved restricted sharing for sensitive materials.</p>
    <Button variant="outline" disabled={busy || loading} onClick={() => setVersion((v) => v + 1)}>Refresh links</Button>
    {loading ? <p role="status">Loading event links…</p> : error ? <p role="alert">{error}</p> : title === null ? <p>Event unavailable.</p> : <>
      <h2>{title}</h2>
      <form className="workflow-form workflow-panel" onSubmit={(e) => void save(e)}>
        <h2>{form.id ? "Edit link" : "Add event link"}</h2>
        <label>Label<input required maxLength={160} value={form.label} disabled={busy} onChange={(e) => setForm({ ...form, label: e.target.value })} /></label>
        <label>Kind<select aria-label="Kind" value={form.kind} disabled={busy} onChange={(e) => setForm({ ...form, kind: e.target.value as Material["kind"] })}><option value="resource">Resource</option><option value="gallery">Google Photos album</option></select></label>
        <label>External HTTPS URL<input type="url" required maxLength={2048} pattern="https://.*" value={form.url} disabled={busy} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
        <p>Gallery links must use photos.app.goo.gl or a photos.google.com album/share URL. Adding a resource approves its external destination for this event.</p>
        <label>Display order<input type="number" required min={-2147483648} max={2147483647} step={1} value={form.display_order} disabled={busy} onChange={(e) => setForm({ ...form, display_order: e.target.valueAsNumber })} /></label>
        <label><input type="checkbox" checked={form.published} disabled={busy} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Published to students</label>
        <p>Published links appear to students once the event is visible.</p>
        <div className="workflow-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : form.id ? "Save changes" : "Add link"}</Button>{form.id && <Button type="button" variant="outline" disabled={busy} onClick={() => setForm(blank)}>Cancel edit</Button>}</div>
      </form>
      {!rows.length ? <p>No gallery or resource links yet.</p> : rows.map((row) => <article className="workflow-panel" key={row.id}>
        <h3><a href={row.url} target="_blank" rel="noopener noreferrer">{row.label}</a></h3>
        <p>{row.kind === "gallery" ? "Google Photos album" : "Resource"} · {row.published ? "Published" : "Hidden"} · Order {row.display_order}</p>
        <div className="workflow-actions"><Button variant="outline" disabled={busy} onClick={() => { setForm(row); setSaveError(""); setMessage(""); }}>Edit</Button>
          {removing === row.id ? <><span>Remove this link?</span><Button disabled={busy} onClick={() => void remove(row.id)}>Confirm removal</Button><Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>Cancel removal</Button></> : <Button variant="outline" disabled={busy} onClick={() => setRemoving(row.id)}>Remove</Button>}
        </div>
      </article>)}
    </>}
    {saveError && <p role="alert">{saveError} Check the link details and try again.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
