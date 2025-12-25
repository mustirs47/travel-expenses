import { useEffect, useMemo, useState } from "react";
import { client } from "../lib/client";
import { uploadData, getUrl } from "aws-amplify/storage";

type Trip = Awaited<ReturnType<typeof client.models.Trip.list>>["data"][number];
type Receipt = Awaited<ReturnType<typeof client.models.Receipt.list>>["data"][number];

const CATEGORIES = ["Food and Drinks", "Fuel", "Hotel", "Car"];

export function TripEditor({ trip, onChanged }: { trip: Trip; onChanged: () => void }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");

  async function loadReceipts() {
    const res = await client.models.Receipt.list({
      filter: { tripId: { eq: trip.id } },
      limit: 500,
    });
    setReceipts(res.data);
  }

  useEffect(() => {
    loadReceipts();
  }, [trip.id]);

  const total = useMemo(() => receipts.reduce((s, r) => s + (r.costEur ?? 0), 0), [receipts]);

  async function updateTrip(patch: Partial<Trip>) {
    // (Performance-Fix später: local draft + onBlur. Jetzt bleibt es wie ist.)
    await client.models.Trip.update({ id: trip.id, ...patch });
    await onChanged();
  }

  async function addReceipt() {
    await client.models.Receipt.create({
      tripId: trip.id,
      category: "Food and Drinks",
      currency: "EUR",
      exchangeRate: 1,
      costEur: 0,
    });
    await loadReceipts();
  }

  async function removeReceipt(id: string) {
    await client.models.Receipt.delete({ id });
    await loadReceipts();
  }

  async function patchReceipt(id: string, patch: Partial<Receipt>) {
    await client.models.Receipt.update({ id, ...patch });
    await loadReceipts();
  }

  async function attachFile(receipt: Receipt, file: File) {
    const key = `receipts/${trip.id}/${receipt.id}/${file.name}`;

    await uploadData({
      path: key,
      data: file,
      options: { contentType: file.type || "application/octet-stream" },
    }).result;

    await patchReceipt(receipt.id, {
      fileKey: key,
      fileName: file.name,
      mimeType: file.type || "",
    });
  }

  async function openPreview(receipt: Receipt) {
    if (!receipt.fileKey) return;
    const { url } = await getUrl({ path: receipt.fileKey });
    setPreviewTitle(receipt.fileName ?? "Attachment");
    setPreviewUrl(url.toString());
  }

  // Category totals (UI wie früher)
  const categoryTotals = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const r of receipts) {
      const cat = (r.category ?? "").trim();
      const cost = Number(r.costEur ?? 0);
      if (!cat || cost === 0) continue;
      sums[cat] = (sums[cat] || 0) + cost;
    }
    return Object.entries(sums).sort((a, b) => b[1] - a[1]);
  }, [receipts]);

  return (
    <div>
      <h1 className="h1">Travel Expenses — Management & Export</h1>

      <div className="row">
        <div className="field">
          <label>Arrival Date</label>
          <input className="input" type="date" value={trip.arrivalDate ?? ""} onChange={(e) => updateTrip({ arrivalDate: e.target.value })} />
        </div>
        <div className="field">
          <label>Return Date</label>
          <input className="input" type="date" value={trip.returnDate ?? ""} onChange={(e) => updateTrip({ returnDate: e.target.value })} />
        </div>
        <div className="field">
          <label>Traveler</label>
          <input className="input" value={trip.traveler ?? ""} onChange={(e) => updateTrip({ traveler: e.target.value })} />
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Receipts: {receipts.length}</div>
        <div className="actions">
          <button className="btn btn-primary" onClick={addReceipt}>Add Row +</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table" role="table" aria-label="Receipts">
          <thead>
            <tr>
              <th className="th numcol">No</th>
              <th className="th">Date</th>
              <th className="th">Category</th>
              <th className="th">Currency</th>
              <th className="th">Exchange Rate</th>
              <th className="th">Cost in EUR</th>
              <th className="th">Attachment</th>
              <th className="th">Action</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((r, idx) => (
              <tr className="tr" key={r.id}>
                <td className="td numcol">{idx + 1}</td>
                <td className="td">
                  <input className="tinput" type="date" value={r.date ?? ""} onChange={(e) => patchReceipt(r.id, { date: e.target.value })} />
                </td>
                <td className="td">
                  <select className="tselect" value={r.category ?? "Food and Drinks"} onChange={(e) => patchReceipt(r.id, { category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="td">
                  <input className="tinput" value={r.currency ?? "EUR"} onChange={(e) => patchReceipt(r.id, { currency: e.target.value })} />
                </td>
                <td className="td">
                  <input className="tinput" type="number" step="0.001" value={Number(r.exchangeRate ?? 1)} onChange={(e) => patchReceipt(r.id, { exchangeRate: Number(e.target.value) })} />
                </td>
                <td className="td">
                  <input className="tinput" type="number" step="0.01" value={Number(r.costEur ?? 0)} onChange={(e) => patchReceipt(r.id, { costEur: Number(e.target.value) })} />
                </td>
                <td className="td">
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      className="tinput"
                      style={{ height: 40, padding: 6 }}
                      type="file"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) attachFile(r, f);
                      }}
                    />
                    <button className="btn btn-muted" disabled={!r.fileKey} onClick={() => openPreview(r)}>Preview</button>
                  </div>
                </td>
                <td className="td">
                  <button className="btn btn-danger" onClick={() => removeReceipt(r.id)}>✖</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {categoryTotals.length > 0 && (
        <div className="totals">
          {categoryTotals.map(([cat, sum]) => (
            <div key={cat} style={{ fontSize: 14, fontWeight: 700 }}>
              {cat}: {sum.toFixed(2)} €
            </div>
          ))}
        </div>
      )}

      <div className="totalbar">
        <strong>Total</strong>
        <strong>{total.toFixed(2)}</strong>
      </div>

      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "grid",
            placeItems: "center",
            padding: 24,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(1100px, 95vw)", height: "min(800px, 85vh)", background: "var(--card-bg)", borderRadius: 12 }}
          >
            <div style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{previewTitle}</strong>
              <button className="btn btn-muted" onClick={() => setPreviewUrl(null)}>Close</button>
            </div>
            <iframe title="preview" src={previewUrl} style={{ width: "100%", height: "calc(100% - 56px)", border: 0 }} />
          </div>
        </div>
      )}
    </div>
  );
}
