/**
 * CSV export.
 *
 * JSON round-trips perfectly and is unreadable to anyone without a text editor
 * and patience. A spreadsheet is what people actually mean when they say they
 * want their data out — so both ship, and the JSON stays the one that can be
 * imported back.
 */

/**
 * Quotes a field for RFC 4180.
 *
 * The leading-character guard is the one that matters for a health export: a
 * value starting with =, +, - or @ is executed as a formula by every major
 * spreadsheet. A note reading "=cmd|..." in someone's training log should not
 * be a live cell.
 */
export function csvCell(value: unknown): string {
  if (value == null) return '';
  const raw = String(value);
  const risky = /^[=+\-@\t\r]/.test(raw);
  const body = risky ? `'${raw}` : raw;
  return /[",\n\r]/.test(body) || risky ? `"${body.replace(/"/g, '""')}"` : body;
}

export function csvRows(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export interface CsvSection {
  name: string;
  headers: string[];
  rows: unknown[][];
}

/**
 * Several tables in one file, each under a `# name` line.
 *
 * One file rather than several because a phone share sheet hands over one
 * thing; spreadsheets import it as a single sheet the user can split.
 */
export function buildCsv(sections: CsvSection[]): string {
  return sections
    .filter((s) => s.rows.length > 0)
    .map((s) => `# ${s.name}\r\n${csvRows([s.headers, ...s.rows])}`)
    .join('\r\n\r\n');
}

export function csvFilename(now: Date = new Date()): string {
  return `forgefit-export-${now.toISOString().slice(0, 10)}.csv`;
}
