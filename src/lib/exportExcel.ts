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

function parseISODate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function exportTripToXlsx(trip: Trip, receipts: Receipt[]) {
  // Header oben
  const titleRow = 1;
  const arrivalRow = 2;
  const returnRow = 3;
  const travelerRow = 4;

  // Tabelle darunter
  const tableHeaderRow = 6;
  const dataStartRow = 7;

  const maxRows = dataStartRow + receipts.length + 3;
  const ws_data: any[][] = Array.from({ length: maxRows }, () => []);
  ws_data[tableHeaderRow - 1] = ["No", "Date", "Category", "Currency", "Exchange Rate", "Cost in EUR"];

  receipts.forEach((r, idx) => {
    ws_data[dataStartRow - 1 + idx] = [
      idx + 1,
      r.date ?? "",
      r.category ?? "",
      r.currency ?? "EUR",
      r.exchangeRate ?? 1,
      r.costEur ?? 0,
    ];
  });

  const total = receipts.reduce((s, r) => s + (Number(r.costEur) || 0), 0);
  const totalRowIndex = dataStartRow - 1 + receipts.length;
  ws_data[totalRowIndex] = ["", "", "", "", "Total", total];

  const ws = XLSX.utils.aoa_to_sheet(ws_data);

  // Header-Zellen setzen (A1/B1 usw.)
  ws[`A${titleRow}`] = { t: "s", v: "Trip Title" };
  ws[`B${titleRow}`] = { t: "s", v: String(trip.title ?? "") };

  ws[`A${arrivalRow}`] = { t: "s", v: "Arrival Date" };
  ws[`A${returnRow}`] = { t: "s", v: "Return Date" };
  ws[`A${travelerRow}`] = { t: "s", v: "Traveler" };

  const arrD = parseISODate(trip.arrivalDate);
  const retD = parseISODate(trip.returnDate);

  ws[`B${arrivalRow}`] = arrD ? { t: "d", v: arrD, z: "dd.mm.yyyy" } : { t: "s", v: trip.arrivalDate ?? "" };
  ws[`B${returnRow}`] = retD ? { t: "d", v: retD, z: "dd.mm.yyyy" } : { t: "s", v: trip.returnDate ?? "" };
  ws[`B${travelerRow}`] = { t: "s", v: String(trip.traveler ?? "") };

  // Column widths
  ws["!cols"] = [
    { wpx: 55 },   // No
    { wpx: 120 },  // Date
    { wpx: 220 },  // Category
    { wpx: 95 },   // Currency
    { wpx: 120 },  // Rate
    { wpx: 120 },  // Cost
  ];

  // Ensure sheet range includes header rows
  ws["!ref"] = `A1:F${totalRowIndex + 1}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Travel Expenses");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `Week${trip.isoWeek || 0}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
