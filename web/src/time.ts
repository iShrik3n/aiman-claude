/** Compact human timestamp: time for today, date + time otherwise. */
export function fmtTime(ms?: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString(
    [],
    sameYear
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" },
  );
  return `${date} ${time}`;
}

/** Full date + time for hover tooltips. */
export function fmtFull(ms?: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}
