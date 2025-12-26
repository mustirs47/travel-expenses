import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import { client } from "../lib/client";
import { uploadData, getUrl, remove } from "aws-amplify/storage";
import { exportTripToXlsx } from "../lib/exportExcel";

type Trip = Awaited<ReturnType<typeof client.models.Trip.list>>["data"][number];
type Receipt = Awaited<ReturnType<typeof client.models.Receipt.list>>["data"][number];

const CATEGORIES = ["Food and Drinks", "Fuel", "Hotel", "Car"];

// ---------- helpers ----------
function normalizeDecimalInput(s: string) {
  return s.replace(/[^0-9,.\-]/g, "");
}
function parseDecimalFlexible(s: string) {
  const v = (s ?? "").replace(",", ".").trim();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function formatFixed(n: number, digits: number) {
  return (Number.isFinite(n) ? n : 0).toFixed(digits);
}
function toNumberFlexible(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(",", ".").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function parseDateToISO(value: any): string | null {
  if (!value) return null;

  // Excel datetime string: "2025-12-09 00:00:00"
  if (typeof value === "string" && value.includes(" ")) {
    const iso = value.split(" ")[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  }

  // ISO
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();

  // dd.mm.yyyy
  if (typeof value === "string" && /^\d{2}\.\d{2}\.\d{4}$/.test(value.trim())) {
    const [dd, mm, yyyy] = value.trim().split(".");
    return `${yyyy}-${mm}-${dd}`;
  }

  // Excel date number
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) {
      const yyyy = String(d.y).padStart(4, "0");
      const mm = String(d.m).padStart(2, "0");
      const dd = String(d.d).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  // fallback
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}
function getISOWeek(dateStr: string): number {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 0;

  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M12 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconEye = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const IconUnlink = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export function TripEditor({ trip, onChanged }: { trip: Trip; onChanged: () => void }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [importing, setImporting] = useState(false);

  const [tripDraft, setTripDraft] = useState({
    title: trip.title ?? "",
    arrivalDate: trip.arrivalDate ?? "",
    returnDate: trip.returnDate ?? "",
    traveler: trip.traveler ?? "",
  });

  const [draft, setDraft] = useState<Record<string, { rate: string; cost: string }>>({});

  useEffect(() => {
    setTripDraft({
      title: trip.title ?? "",
      arrivalDate: trip.arrivalDate ?? "",
      returnDate: trip.returnDate ?? "",
      traveler: trip.traveler ?? "",
    });
    setDraft({});
    void loadReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  async function loadReceipts() {
    const res = await client.models.Receipt.list({
      filter: { tripId: { eq: trip.id } },
      limit: 1000,
    });

    setReceipts(res.data);

    const seeded: Record<string, { rate: string; cost: string }> = {};
    for (const r of res.data) {
      seeded[r.id] = {
        rate: r.exchangeRate != null ? formatFixed(Number(r.exchangeRate), 3) : "1.000",
        cost: r.costEur != null ? formatFixed(Number(r.costEur), 2) : "0.00",
      };
    }
    setDraft(seeded);
  }

  async function persistTrip() {
    await client.models.Trip.update({
      id: trip.id,
      title: tripDraft.title,
      arrivalDate: tripDraft.arrivalDate,
      returnDate: tripDraft.returnDate,
      traveler: tripDraft.traveler,
    });
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
    await loadReceipts();
  }

  async function removeAttachment(receipt: Receipt) {
    if (!receipt.fileKey) return;
    const ok = confirm("Remove attachment from this row?");
    if (!ok) return;

    try {
      await remove({ path: receipt.fileKey });
    } catch {
      // ignore
    }

    await patchReceipt(receipt.id, { fileKey: null, fileName: null, mimeType: null });
    await loadReceipts();
  }

  async function openPreview(receipt: Receipt) {
    if (!receipt.fileKey) return;
    const { url } = await getUrl({ path: receipt.fileKey });
    setPreviewTitle(receipt.fileName ?? "Attachment");
    setPreviewUrl(url.toString());
  }

  async function importXlsx(file: File) {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][];

      // ---- READ TRIP META (top rows) ----
      let arrivalDate = "";
      let returnDate = "";
      let traveler = "";
      let title = "";

      for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;

        const label = String(row[0] ?? "").toLowerCase().trim();
        const value = row[1];

        if (label.includes("arrival")) arrivalDate = parseDateToISO(value) ?? "";
        if (label.includes("return")) returnDate = parseDateToISO(value) ?? "";
        if (label.includes("traveler")) traveler = String(value ?? "").trim();
        if (label.includes("trip title") || (label.includes("trip") && label.includes("title"))) title = String(value ?? "").trim();
      }

      if (!traveler) traveler = "Mustafa Resitoglu";
      if (!title) {
        const base = arrivalDate || returnDate;
        if (base) title = `Week ${getISOWeek(base)}`;
      }

      await client.models.Trip.update({
        id: trip.id,
        title: title || tripDraft.title,
        arrivalDate: arrivalDate || tripDraft.arrivalDate,
        returnDate: returnDate || tripDraft.returnDate,
        traveler: traveler || tripDraft.traveler || "Mustafa Resitoglu",
      });

      setTripDraft((p) => ({
        ...p,
        title: title || p.title,
        arrivalDate: arrivalDate || p.arrivalDate,
        returnDate: returnDate || p.returnDate,
        traveler: traveler || p.traveler || "Mustafa Resitoglu",
      }));

      // ---- FIND RECEIPT TABLE HEADER ----
      const norm = (x: any) => String(x ?? "").toLowerCase().replace(/\s+/g, " ").trim();

      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 120); i++) {
        const r = rows[i]?.map(norm) ?? [];
        const hasDate = r.some((c) => c === "date" || c.includes("date"));
        const hasCat = r.some((c) => c === "category" || c.includes("category"));
        const hasCost = r.some((c) => c.includes("cost") && c.includes("eur"));
        if (hasDate && hasCat && hasCost) {
          headerRowIdx = i;
          break;
        }
      }

      if (headerRowIdx === -1) {
        alert("Receipt header row not found. Expected columns like: Date, Category, Currency, Exchange Rate, Cost in EUR.");
        return;
      }

      const header = rows[headerRowIdx].map(norm);

      const idxDate = header.findIndex((h) => h === "date" || h.includes("date"));
      const idxCat = header.findIndex((h) => h.includes("category"));
      const idxCurr = header.findIndex((h) => h.includes("currency") || h === "curr");
      const idxRate = header.findIndex((h) => h.includes("exchange") || h.includes("rate"));
      const idxCost = header.findIndex((h) => h.includes("cost") && h.includes("eur"));

      if (idxCat < 0 || idxCost < 0) {
        alert("Import failed: required columns not found (Category / Cost in EUR).");
        return;
      }

      const dataRows = rows
        .slice(headerRowIdx + 1)
        .filter((r) => r && r.some((x) => String(x ?? "").trim() !== ""));

      let imported = 0;

      for (const r of dataRows) {
        const rawCategory = idxCat >= 0 ? String(r[idxCat] ?? "").trim() : "";
        const categoryLower = rawCategory.toLowerCase();

        if (!rawCategory) continue;
        if (categoryLower.includes("total")) continue;

        const costEur = idxCost >= 0 ? toNumberFlexible(r[idxCost]) : 0;
        if (!costEur || costEur === 0) continue;

        const dateISO = idxDate >= 0 ? parseDateToISO(r[idxDate]) : null;
        const currency = idxCurr >= 0 ? String(r[idxCurr] ?? "EUR").trim() : "EUR";
        const exchangeRate = idxRate >= 0 ? toNumberFlexible(r[idxRate]) : 1;

        await client.models.Receipt.create({
          tripId: trip.id,
          date: dateISO ?? "",
          category: rawCategory || "Food and Drinks",
          currency: currency || "EUR",
          exchangeRate: exchangeRate || 1,
          costEur: costEur,
        });

        imported++;
      }

      await loadReceipts();
      await onChanged();

      if (imported === 0) {
        alert("Import finished, but 0 receipts were detected. Check the Excel header/format.");
      } else {
        alert(`Import finished: ${imported} receipts imported.`);
      }
    } catch (e) {
      console.error(e);
      alert("Import failed. Check console for details.");
    } finally {
      setImporting(false);
    }
  }

  const total = useMemo(() => receipts.reduce((s, r) => s + (Number(r.costEur) || 0), 0), [receipts]);

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
          <label>Trip Title</label>
          <input
            className="input"
            value={tripDraft.title}
            onChange={(e) => setTripDraft((p) => ({ ...p, title: e.target.value }))}
            onBlur={persistTrip}
            placeholder={`Week ${trip.isoWeek ?? ""}`}
          />
        </div>
        <div className="field">
          <label>Arrival Date</label>
          <input
            className="input"
            type="date"
            value={tripDraft.arrivalDate}
            onChange={(e) => setTripDraft((p) => ({ ...p, arrivalDate: e.target.value }))}
            onBlur={persistTrip}
          />
        </div>
        <div className="field">
          <label>Return Date</label>
          <input
            className="input"
            type="date"
            value={tripDraft.returnDate}
            onChange={(e) => setTripDraft((p) => ({ ...p, returnDate: e.target.value }))}
            onBlur={persistTrip}
          />
        </div>
        <div className="field">
          <label>Traveler</label>
          <input
            className="input"
            value={tripDraft.traveler}
            onChange={(e) => setTripDraft((p) => ({ ...p, traveler: e.target.value }))}
            onBlur={persistTrip}
            placeholder="Name"
          />
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>Receipts: {receipts.length}</div>

        <div className="actions">
          <input
            id="import-xlsx"
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importXlsx(f);
              setTimeout(() => {
                e.currentTarget.value = "";
              }, 0);
            }}
          />

          <label className={`btn btn-muted ${importing ? "btn-disabled" : ""}`} htmlFor="import-xlsx">
            Import Excel
          </label>

          <button className="btn btn-primary" onClick={() => void addReceipt()}>
            Add Row +
          </button>

          <button
            className="btn btn-muted"
            onClick={() =>
              exportTripToXlsx(
                {
                  arrivalDate: tripDraft.arrivalDate,
                  returnDate: tripDraft.returnDate,
                  traveler: tripDraft.traveler,
                  isoWeek: Number(trip.isoWeek ?? 0),
                  title: tripDraft.title,
                },
                receipts.map((r) => ({
                  date: r.date ?? "",
                  category: r.category ?? "Food and Drinks",
                  currency: r.currency ?? "EUR",
                  exchangeRate: Number(r.exchangeRate ?? 1),
                  costEur: Number(r.costEur ?? 0),
                }))
              )
            }
          >
            Export Excel
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table" role="table" aria-label="Receipts">
          <colgroup>
            <col style={{ width: 46 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 70 }} />
          </colgroup>

          <thead>
            <tr>
              <th className="th numcol">No</th>
              <th className="th">Date</th>
              <th className="th">Category</th>
              <th className="th">Curr</th>
              <th className="th">Rate</th>
              <th className="th">EUR</th>
              <th className="th">File</th>
              <th className="th">Del</th>
            </tr>
          </thead>

          <tbody>
            {receipts.map((r, idx) => {
              const inputId = `file-${r.id}`;
              const d = draft[r.id] ?? { rate: "1.000", cost: "0.00" };

              return (
                <tr className="tr" key={r.id}>
                  <td className="td numcol">{idx + 1}</td>

                  <td className="td">
                    <input
                      className="tinput tdate"
                      type="date"
                      value={r.date ?? ""}
                      onChange={(e) => {
                        setReceipts((prev) => prev.map((x) => (x.id === r.id ? { ...x, date: e.target.value } : x)));
                      }}
                      onBlur={async () => {
                        const current = receipts.find((x) => x.id === r.id);
                        await patchReceipt(r.id, { date: current?.date ?? "" });
                        await loadReceipts();
                      }}
                    />
                  </td>

                  <td className="td">
                    <select
                      className="tselect"
                      value={r.category ?? "Food and Drinks"}
                      onChange={(e) => {
                        setReceipts((prev) => prev.map((x) => (x.id === r.id ? { ...x, category: e.target.value } : x)));
                      }}
                      onBlur={async () => {
                        const current = receipts.find((x) => x.id === r.id);
                        await patchReceipt(r.id, { category: current?.category ?? "Food and Drinks" });
                        await loadReceipts();
                      }}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="td">
                    <input
                      className="tinput"
                      value={r.currency ?? "EUR"}
                      onChange={(e) => setReceipts((prev) => prev.map((x) => (x.id === r.id ? { ...x, currency: e.target.value } : x)))}
                      onBlur={async () => {
                        const current = receipts.find((x) => x.id === r.id);
                        await patchReceipt(r.id, { currency: current?.currency ?? "EUR" });
                        await loadReceipts();
                      }}
                    />
                  </td>

                  <td className="td">
                    <input
                      className="tinput tnum"
                      inputMode="decimal"
                      value={d.rate}
                      onChange={(e) => {
                        const v = normalizeDecimalInput(e.target.value);
                        setDraft((p) => ({ ...p, [r.id]: { ...d, rate: v } }));
                      }}
                      onBlur={async () => {
                        const num = parseDecimalFlexible(d.rate);
                        setDraft((p) => ({ ...p, [r.id]: { ...d, rate: formatFixed(num, 3) } }));
                        await patchReceipt(r.id, { exchangeRate: num });
                        await loadReceipts();
                      }}
                    />
                  </td>

                  <td className="td">
                    <input
                      className="tinput tnum"
                      inputMode="decimal"
                      value={d.cost}
                      onChange={(e) => {
                        const v = normalizeDecimalInput(e.target.value);
                        setDraft((p) => ({ ...p, [r.id]: { ...d, cost: v } }));
                      }}
                      onBlur={async () => {
                        const num = parseDecimalFlexible(d.cost);
                        setDraft((p) => ({ ...p, [r.id]: { ...d, cost: formatFixed(num, 2) } }));
                        await patchReceipt(r.id, { costEur: num });
                        await loadReceipts();
                      }}
                    />
                  </td>

                  <td className="td">
                    <div className="iconbar">
                      <input
                        id={inputId}
                        type="file"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void attachFile(r, f);
                          e.currentTarget.value = "";
                        }}
                      />

                      <button className="ibtn" type="button" title="Upload" onClick={() => (document.getElementById(inputId) as HTMLInputElement | null)?.click()}>
                        <IconUpload />
                      </button>

                      <button className="ibtn" type="button" title="Preview" disabled={!r.fileKey} onClick={() => void openPreview(r)}>
                        <IconEye />
                      </button>

                      <button className="ibtn ibtn-danger" type="button" title="Remove attachment" disabled={!r.fileKey} onClick={() => void removeAttachment(r)}>
                        <IconUnlink />
                      </button>
                    </div>

                    {r.fileName && (
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.fileName}
                      </div>
                    )}
                  </td>

                  <td className="td">
                    <button className="btn btn-danger" onClick={() => void removeReceipt(r.id)} style={{ padding: "10px 12px" }}>
                      ✖
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {categoryTotals.length > 0 && (
        <div className="totals">
          {categoryTotals.map(([cat, sum]) => (
            <div key={cat} style={{ fontSize: 14, fontWeight: 800 }}>
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
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1100px, 95vw)", height: "min(800px, 85vh)", background: "var(--card-bg)", borderRadius: 12 }}>
            <div style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{previewTitle}</strong>
              <button className="btn btn-muted" onClick={() => setPreviewUrl(null)}>
                Close
              </button>
            </div>
            <iframe title="preview" src={previewUrl} style={{ width: "100%", height: "calc(100% - 56px)", border: 0 }} />
          </div>
        </div>
      )}

      {importing && (
        <div className="loading-overlay" role="alert" aria-busy="true">
          <div className="loading-card">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="spinner" />
              <div>
                <div style={{ fontWeight: 900, marginBottom: 4 }}>Importing Excel…</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Please wait.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
