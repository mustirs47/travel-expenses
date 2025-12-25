import { useEffect, useMemo, useState } from "react";
import { client } from "../lib/client";
import { TripEditor } from "./TripEditor";

type Trip = Awaited<ReturnType<typeof client.models.Trip.list>>["data"][number];

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  async function refresh() {
    const res = await client.models.Trip.list({ limit: 100 });
    // optional: sort newest first
    const sorted = [...res.data].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    setTrips(sorted);
  }

  useEffect(() => {
    refresh();
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
    setSelectedTripId(created.data?.id ?? null);
  }

  return (
    <div className="layout">
      <div className="panel">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <button className="btn btn-primary" onClick={createTrip} style={{ width: "100%" }}>
            + New Trip
          </button>
        </div>

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {trips.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTripId(t.id)}
              className={`tripbtn ${t.id === selectedTripId ? "active" : ""}`}
            >
              <div style={{ fontWeight: 800 }}>{t.title ?? `Week ${t.isoWeek}`}</div>
              <div className="tripmeta">
                {t.arrivalDate} → {t.returnDate}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        {selected ? (
          <TripEditor trip={selected} onChanged={refresh} />
        ) : (
          <div style={{ opacity: 0.75 }}>Select a trip.</div>
        )}
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
