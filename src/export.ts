import type { Analysis } from './quality.js';
import type { Delimiter } from './csv.js';
export function formulaLike(value: string): boolean {
  return /^[\s]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value);
}
export function csvText(
  rows: string[][],
  delimiter: Delimiter = ',',
  protect = true,
): { text: string; protectedCells: number } {
  let protectedCells = 0;
  const encode = (input: string): string => {
    let value = input;
    if (protect && formulaLike(value)) {
      value = `'${value}`;
      protectedCells++;
    }
    return value === '' || value.includes(delimiter) || /["\r\n]/.test(value)
      ? `"${value.replaceAll('"', '""')}"`
      : value;
  };
  return {
    text: rows.map((row) => row.map(encode).join(delimiter)).join('\r\n') + '\r\n',
    protectedCells,
  };
}
export function validCsv(analysis: Analysis, delimiter: Delimiter, protect: boolean) {
  const headers = analysis.headers
    .map((value) => (protect && formulaLike(value) ? `'${value}` : value))
    .map((value) => value.toLocaleLowerCase('en-US'));
  if (new Set(headers).size !== headers.length)
    throw new Error(
      'Spreadsheet protection would make column headers ambiguous. Rename the affected source headers before export.',
    );
  return csvText(
    [
      analysis.headers,
      ...analysis.rows.filter((row) => row.issues.length === 0).map((row) => row.values),
    ],
    delimiter,
    protect,
  );
}
export function reviewJson(analysis: Analysis): string {
  return JSON.stringify(
    {
      version: 1,
      headers: analysis.headers,
      totalRows: analysis.rows.length,
      validRows: analysis.valid,
      excludedRows: analysis.blocked,
      rows: analysis.rows
        .filter((row) => row.issues.length)
        .map((row) => ({ record: row.number, originalValues: row.original, issues: row.issues })),
    },
    null,
    2,
  );
}
