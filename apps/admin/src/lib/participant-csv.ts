export interface ParticipantExportRow {
  full_name: string;
  roll_number: string;
  course: string | null;
  branch: string | null;
  department: string;
  section: string | null;
  academic_year: number;
  registered_at: string;
}
const columns = ["full_name", "roll_number", "course", "branch", "department", "section", "academic_year", "registered_at"] as const;
function cell(value: string | number | null): string {
  let text = value == null ? "" : String(value);
  // Prefix dangerous spreadsheet text after whitespace/control characters.
  if (typeof value === "string" && (/^[\s\p{Cc}]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text))) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function participantCsv(rows: readonly ParticipantExportRow[], bom = true): string {
  return `${bom ? "\uFEFF" : ""}${[columns.map(cell).join(","), ...rows.map((row) => columns.map((key) => cell(row[key])).join(","))].join("\r\n")}\r\n`;
}
export function participantExportFilename(eventId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(eventId)) throw new Error("Invalid event identifier");
  return `participants-${eventId.toLowerCase()}.csv`;
}
