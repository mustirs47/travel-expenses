import { useEffect, useMemo, useState } from "react";
import { client } from "../lib/client";
import { TripEditor } from "./TripEditor";
import { remove } from "aws-amplify/storage";

type Trip = Awaited<ReturnType<typeof client.models.Trip.list>>["data"][number];
type Receipt = Awaited<ReturnType<typeof client.models.Receipt.list>>["data"][number];

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  async function refresh() {
    const res = await client.models.Trip.list({ limit: 200 });
    const sorted = [...res.data].sort((a, b) => {
      const wk = (b.isoWeek ?? 0) - (a.isoWeek ?? 0);
      if (wk !== 0) return wk;
      return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
    });
    setTrips(sorted);
    // auto select first if nothing selected
    if (!selectedTripId && sorted[0]?.id) setSelectedTripId(sorted[0].id);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => trips.find((t) => t.id === selectedTripId) ?? null,
    [trips, selectedTripId]
  );

  async function createTrip() {
    const now = new Date();
    const iso = now.toISOString().slice(0, 10);
    const wk = isoWeekNumber(now);

    const created = await client.models.Trip.create({
      arrivalDate: iso,
      returnDate: iso,
      traveler: "Musti",
      isoWeek: wk,
      title: `Week ${wk}`,
    });

    await refresh();
    if (created.data?.id) setSelectedTripId(created.data.id);
  }

  async function deleteTrip(trip: Trip) {
    const ok = confirm(`Delete "${trip.title ?? `Week ${trip.isoWeek}`}" including all receipts and attachments?`);
    if (!ok) return;

    // 1) load receipts for trip
    const r = await client.models.Receipt.list({
      filter: { tripId: { eq: trip.id } },
      limit: 1000,
    });

    // 2) delete attachments (best-effort)
    const receipts = r.data as Receipt[];
    for (const rec of receipts) {
      if (rec.fileKey) {
        try {
          await remove({ path: rec.fileKey });
        } catch {
          // ignore; still delete db row
        }
      }
    }

    // 3) delete receipt rows
    for (const rec of receipts) {
      try {
        await client.models.Receipt.delete({ id: rec.id });
      } catch {
        // ignore individual failures; continue
      }
    }

    // 4) delete trip
    await client.models.Trip.delete({ id: trip.id });

    // 5) refresh + selection
    const wasSelected = selectedTripId === trip.id;
    await refresh();
    if (wasSelected) setSelectedTripId(null);
  }

  return (
    <div className="layout">
      <div className="panel">
        <button className="btn btn-primary" onClick={createTrip} style={{ width: "100%" }}>
          + New Trip
        </button>

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {trips.map((t) => (
            <div key={t.id} className={`triprow ${t.id === selectedTripId ? "active" : ""}`}>
              <button className="tripmain" onClick={() => setSelectedTripId(t.id)}>
                <div style={{ fontWeight: 800 }}>{t.title ?? `Week ${t.isoWeek}`}</div>
                <div className="tripmeta">
                  {t.arrivalDate} → {t.returnDate}
                </div>
              </button>
              <button className="btn btn-danger tripdel" onClick={() => deleteTrip(t)} title="Delete trip">
                ✖
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        {selected ? <TripEditor trip={selected} onChanged={refresh} /> : <div style={{ opacity: 0.75 }}>Select a trip.</div>}
      </div>
    </div>
  );
}

function isoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((+d - +yearStart) / 86400000 + 1) / 7);
}
