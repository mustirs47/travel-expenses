import * as XLSX from "xlsx";

type Trip = {
  arrivalDate: string;
  returnDate: string;
  traveler: string;
  isoWeek: number;
  title?: string | null;
};

type Receipt = {
  date?: string | null;
  category: string;
  currency: string;
  exchangeRate: number;
  costEur: number;
};

function safeNum(n: unknown, fallback = 0) {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function parseISODate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function exportTripToXlsx(trip: Trip, receipts: Receipt[]) {
  // Layout ähnlich deiner alten Datei:
  // A6/B6 Arrival, A7/B7 Return, A8/B8 Traveler
  // Header ab Zeile 10, Daten ab Zeile 11

  const arrivalRow = 6;
  const returnRow = 7;
  const travelerRow = 8;
  const tableHeaderRow = 10;
  const dataStartRow = tableHeaderRow + 1;

  const maxRows = dataStartRow + receipts.length + 3;
  const ws_data: any[][] = Array.from({ length: maxRows }, () => []);

  ws_data[tableHeaderRow - 1] = ["No", "Date", "Category", "Currency", "Exchange Rate", "Cost in EUR"];

  receipts.forEach((r, idx) => {
    ws_data[dataStartRow - 1 + idx] = [
      idx + 1,
      r.date ?? "",
      r.category ?? "",
      r.currency ?? "EUR",
      safeNum(r.exchangeRate, 1),
      safeNum(r.costEur, 0),
    ];
  });

  const totalRowIndex = dataStartRow - 1 + receipts.length;
  const total = receipts.reduce((s, r) => s + safeNum(r.costEur, 0), 0);
  ws_data[totalRowIndex] = ["", "", "", "", "Total", total];

  const ws = XLSX.utils.aoa_to_sheet(ws_data);

  // Spaltenbreiten
  ws["!cols"] = [
    { wpx: 70 },
    { wpx: 120 },
    { wpx: 220 },
    { wpx: 100 },
    { wpx: 120 },
    { wpx: 120 },
  ];

  // Header-Felder A6/B6 usw.
  ws[`A${arrivalRow}`] = { t: "s", v: "Arrival Date" };
  ws[`A${returnRow}`] = { t: "s", v: "Return Date" };
  ws[`A${travelerRow}`] = { t: "s", v: "Traveler" };

  const arrD = parseISODate(trip.arrivalDate);
  const retD = parseISODate(trip.returnDate);

  ws[`B${arrivalRow}`] = arrD ? { t: "d", v: arrD, z: "dd.mm.yyyy" } : { t: "s", v: trip.arrivalDate ?? "" };
  ws[`B${returnRow}`] = retD ? { t: "d", v: retD, z: "dd.mm.yyyy" } : { t: "s", v: trip.returnDate ?? "" };
  ws[`B${travelerRow}`] = { t: "s", v: trip.traveler ?? "" };

  // Formatierung der Spalten in Datenzeilen
  receipts.forEach((r, idx) => {
    const row = dataStartRow + idx;

    // No
    ws[`A${row}`] = { t: "n", v: idx + 1 };

    // Date
    const d = parseISODate(r.date);
    ws[`B${row}`] = d ? { t: "d", v: d, z: "dd.mm.yyyy" } : { t: "s", v: r.date ?? "" };

    // Category/Currency
    ws[`C${row}`] = { t: "s", v: r.category ?? "" };
    ws[`D${row}`] = { t: "s", v: r.currency ?? "EUR" };

    // Exchange Rate (3 decimals)
    ws[`E${row}`] = { t: "n", v: safeNum(r.exchangeRate, 1), z: "0.000" };

    // Cost (2 decimals)
    ws[`F${row}`] = { t: "n", v: safeNum(r.costEur, 0), z: "0.00" };
  });

  // Total row formatting
  const totalExcelRow = totalRowIndex + 1;
  ws[`E${totalExcelRow}`] = { t: "s", v: "Total" };
  ws[`F${totalExcelRow}`] = { t: "n", v: total, z: "0.00" };

  // Autofilter auf die Tabelle (wenn Daten vorhanden)
  if (receipts.length > 0) {
    const lastDataRow = dataStartRow + receipts.length - 1;
    (ws as any)["!autofilter"] = { ref: `A${tableHeaderRow}:F${lastDataRow}` };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Travel Expenses");

  const fileName = `Week${trip.isoWeek}.xlsx`;
  XLSX.writeFile(wb, fileName, { bookType: "xlsx" });
}
