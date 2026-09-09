export type Preset = "7d" | "30d" | "thisMonth" | "lastMonth" | "custom";

export const presets: { id: Preset; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "custom", label: "Custom" },
];

export function iso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysAgo(days: number, from: Date): Date {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  return date;
}

/// Start and end, inclusive, for a preset. `today` is local time.
export function presetRange(preset: Preset, today = new Date()): { start: string; end: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "7d":
      return { start: iso(daysAgo(6, today)), end: iso(today) };
    case "30d":
      return { start: iso(daysAgo(29, today)), end: iso(today) };
    case "thisMonth":
      return { start: iso(new Date(y, m, 1)), end: iso(today) };
    case "lastMonth":
      return { start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)) };
    case "custom":
      return { start: iso(daysAgo(6, today)), end: iso(today) };
  }
}
