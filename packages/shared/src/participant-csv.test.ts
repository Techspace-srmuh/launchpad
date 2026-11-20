import { describe, expect, it } from "vitest";
import { participantCsv, participantExportFilename, type ParticipantExportRow } from "../../../apps/admin/src/lib/participant-csv";
const participant: ParticipantExportRow = { full_name: 'Zoë, "学生"\r\nSecond line', roll_number: "RA001", course: "B.Tech", branch: "CSE", department: "Engineering", section: null, academic_year: 2, registered_at: "2026-11-20T00:00:00+00:00" };
// Independent CSV consumer checks quotes, multiline text and separators.
function parse(csv: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  const text = csv.replace(/^\uFEFF/u, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && char === ",") { row.push(field); field = ""; }
    else if (!quoted && char === "\r" && text[i + 1] === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; }
    else field += char;
  }
  return rows;
}
describe("participant CSV", () => {
  it("round-trips Unicode, quotes, commas and multiline text in eight fields", () => {
    const csv = participantCsv([participant]); expect(csv.startsWith("\uFEFF")).toBe(true); expect(csv.endsWith("\r\n")).toBe(true);
    const rows = parse(csv);
    expect(rows[0]).toEqual(["full_name", "roll_number", "course", "branch", "department", "section", "academic_year", "registered_at"]);
    expect(rows[1]).toEqual([participant.full_name, "RA001", "B.Tech", "CSE", "Engineering", "", "2", participant.registered_at]);
    expect(participantCsv([], false)).not.toContain("\uFEFF"); expect(parse(participantCsv([]))).toHaveLength(1);
  });
  it.each(["=1+1", "+SUM(A1)", "-2+3", "@SUM(A1)", "  =cmd()", "\t+cmd()", "\r=1", "\n@1", "\u00a0=1", "\u0000=1", "\ttext"])("neutralizes formula input %j without mutating source", (value) => {
    const row = { ...participant, full_name: value, department: value }; const cells = parse(participantCsv([row]))[1];
    expect(cells[0]).toBe(`'${value}`); expect(cells[4]).toBe(`'${value}`); expect(row.full_name).toBe(value);
  });
  it("retains more than 1000 rows", () => {
    const parsed = parse(participantCsv(Array.from({ length: 1205 }, (_, i) => ({ ...participant, roll_number: `RA${i}` }))));
    expect(parsed).toHaveLength(1206); expect(parsed.at(-1)?.[1]).toBe("RA1204");
  });
  it("uses a validated UUID filename", () => {
    expect(participantExportFilename("ABCDEF12-1234-5678-9012-123456789012")).toBe("participants-abcdef12-1234-5678-9012-123456789012.csv");
    expect(() => participantExportFilename("../my-event")).toThrow("Invalid event identifier");
  });
});
