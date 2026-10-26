import type { Dataset } from './csv.js';
export interface Rules {
  trim: boolean;
  deduplicate: boolean;
  required: number[];
  email: number[];
  unique: number | null;
}
export type IssueCode = 'shape' | 'required' | 'email' | 'duplicate' | 'key';
export interface Issue {
  code: IssueCode;
  message: string;
}
export interface CheckedRow {
  number: number;
  original: string[];
  values: string[];
  issues: Issue[];
}
export interface Analysis {
  headers: string[];
  rows: CheckedRow[];
  valid: number;
  blocked: number;
  duplicates: number;
  trimmedCells: number;
}
export function defaults(headers: string[]): Rules {
  return {
    trim: true,
    deduplicate: true,
    required: [],
    email: headers.flatMap((header, i) => (/(^|[_\s-])e?mail($|[_\s-])/i.test(header) ? [i] : [])),
    unique: null,
  };
}
export function analyze(data: Dataset, rules: Rules): Analysis {
  for (const index of [
    ...rules.required,
    ...rules.email,
    ...(rules.unique === null ? [] : [rules.unique]),
  ]) {
    if (!Number.isInteger(index) || index < 0 || index >= data.headers.length)
      throw new Error('Rule references an unknown column');
  }
  const exact = new Set<string>(),
    keys = new Set<string>();
  let trimmedCells = 0,
    duplicates = 0;
  const names = (indices: number[]) =>
    indices
      .slice(0, 5)
      .map((index) => data.headers[index])
      .join(', ') + (indices.length > 5 ? ` and ${indices.length - 5} more` : '');
  const rows = data.rows.map((original, index): CheckedRow => {
    const values = original.map((value) => {
      const next = rules.trim ? value.trim() : value;
      if (next !== value) trimmedCells++;
      return next;
    });
    const issues: Issue[] = [];
    if (values.length !== data.headers.length)
      issues.push({
        code: 'shape',
        message: `Expected ${data.headers.length} fields, found ${values.length}`,
      });
    const missing = rules.required.filter((column) => !(values[column] ?? '').trim());
    if (missing.length)
      issues.push({ code: 'required', message: `Required value missing: ${names(missing)}` });
    const invalid = rules.email.filter(
      (column) => values[column] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[column]!),
    );
    if (invalid.length)
      issues.push({ code: 'email', message: `Check email syntax: ${names(invalid)}` });
    if (rules.unique !== null) {
      const key = values[rules.unique] ?? '';
      if (!key.trim())
        issues.push({ code: 'key', message: `Unique key is empty: ${data.headers[rules.unique]}` });
      else if (keys.has(key))
        issues.push({ code: 'key', message: `Repeated key in ${data.headers[rules.unique]}` });
      // A rejected row must not reserve a key needed by a later usable row.
      else if (issues.length === 0) keys.add(key);
    }
    const serialized = JSON.stringify(values);
    if (rules.deduplicate && exact.has(serialized))
      issues.push({ code: 'duplicate', message: 'Exact duplicate of an earlier usable row' });
    if (issues.length === 0) exact.add(serialized);
    if (
      issues.some(
        (issue) =>
          issue.code === 'duplicate' ||
          (issue.code === 'key' && issue.message.startsWith('Repeated')),
      )
    )
      duplicates++;
    return { number: index + 2, original, values, issues };
  });
  const valid = rows.filter((row) => row.issues.length === 0).length;
  return {
    headers: data.headers,
    rows,
    valid,
    blocked: rows.length - valid,
    duplicates,
    trimmedCells,
  };
}
