import { format } from "date-fns";

export function exportToCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: any) => {
    const str = v == null ? "" : String(v);
    return str.includes(",") || str.includes('"') || str.includes("\n")
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const csv = [
    headers.map(escape).join(","),
    ...rows.map(row => row.map(escape).join(",")),
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function filterByDateRange<T>(
  items: T[],
  dateField: keyof T,
  from: string | null,
  to: string | null
): T[] {
  return items.filter(item => {
    const val = item[dateField] as unknown as string | null;
    if (!val) return false;
    if (from && val < from) return false;
    if (to && val > to) return false;
    return true;
  });
}
