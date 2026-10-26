import { limits, type Delimiter } from './csv.js';
import { type Analysis, type Rules } from './quality.js';
import { validCsv, reviewJson } from './export.js';
import { demoCsv } from './sample.js';

const el = <T extends HTMLElement>(id: string): T => {
  const item = document.getElementById(id);
  if (!item) throw new Error(`Missing ${id}`);
  return item as T;
};
interface Result {
  id: number;
  ok: boolean;
  error?: string;
  analysis: Analysis;
  rules: Rules;
  delimiter: Delimiter;
}
let checker: Worker,
  revision = 0,
  fileRevision = 0,
  source = '',
  filename = 'data.csv',
  analysis: Analysis | undefined,
  rules: Rules | undefined,
  delimiter: Delimiter = ',',
  page = 0;
const pageSize = 25;
function message(text: string, error = false): void {
  el('notice').textContent = text;
  el('notice').className = error ? 'notice error' : 'notice';
}
function busy(value: boolean): void {
  el('workspace').setAttribute('aria-busy', String(value));
  el<HTMLButtonElement>('export').disabled = value || !analysis?.valid;
  el<HTMLButtonElement>('report').disabled = value || !analysis;
}
function startWorker(): void {
  checker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  checker.onmessage = (event: MessageEvent<Result>) => {
    const result = event.data;
    if (result.id !== revision) return;
    if (!result.ok) {
      analysis = undefined;
      rules = undefined;
      busy(false);
      el('workspace').hidden = true;
      el('file-info').textContent =
        'Format needs attention · adjust the separator or choose another file';
      message(result.error ?? 'The file could not be checked', true);
      return;
    }
    const first = rules === undefined;
    analysis = result.analysis;
    rules = result.rules;
    delimiter = result.delimiter;
    page = 0;
    el('workspace').hidden = false;
    el('loaded-file').hidden = false;
    el('file-name').textContent = filename;
    el('file-info').textContent =
      `${analysis.headers.length} columns · ${delimiter === ',' ? 'Comma' : delimiter === ';' ? 'Semicolon' : 'Tab'} separated · UTF-8`;
    if (first) buildRules();
    render();
    busy(false);
    message(
      `Checked ${analysis.rows.length.toLocaleString()} records. ${analysis.valid.toLocaleString()} ready; ${analysis.blocked.toLocaleString()} need review. Your source file is unchanged.`,
    );
  };
  checker.onerror = () => {
    analysis = undefined;
    rules = undefined;
    busy(false);
    el('workspace').hidden = true;
    message('The checker stopped unexpectedly. Clear the file and try again.', true);
  };
}
startWorker();
function loadText(text: string, name: string): void {
  source = text;
  filename = name;
  rules = undefined;
  analysis = undefined;
  el('loaded-file').hidden = false;
  el('file-name').textContent = filename;
  el('file-info').textContent = 'Checking locally…';
  busy(true);
  message('Checking your file in this browser…');
  checker.postMessage({
    id: ++revision,
    text: source,
    delimiter: el<HTMLSelectElement>('delimiter').value,
  });
}
async function loadFile(file: File): Promise<void> {
  const operation = ++fileRevision;
  try {
    if (file.size > limits.bytes) throw new Error('Choose a file no larger than 3 MiB');
    const bytes = await file.arrayBuffer();
    if (operation !== fileRevision) return;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    loadText(text, file.name);
  } catch (error) {
    if (operation === fileRevision)
      message(
        error instanceof TypeError
          ? 'This file is not valid UTF-8. Export it as UTF-8 CSV and try again.'
          : error instanceof Error
            ? error.message
            : 'Unable to read this file',
        true,
      );
  }
}
function checkRules(): void {
  if (!rules) return;
  busy(true);
  message('Applying your rules…');
  checker.postMessage({ id: ++revision, rules });
}
function buildRules(): void {
  if (!analysis || !rules) return;
  el<HTMLInputElement>('trim').checked = rules.trim;
  el<HTMLInputElement>('deduplicate').checked = rules.deduplicate;
  const columns = el('column-rules');
  columns.replaceChildren();
  const unique = el<HTMLSelectElement>('unique');
  unique.replaceChildren(new Option('No unique key', ''));
  analysis.headers.forEach((header, index) => {
    unique.append(new Option(header, String(index)));
    const row = document.createElement('div');
    row.className = 'column-rule';
    const name = document.createElement('span');
    name.textContent = header;
    name.title = header;
    row.append(name);
    for (const kind of ['required', 'email'] as const) {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = rules![kind].includes(index);
      box.setAttribute(
        'aria-label',
        `${kind === 'required' ? 'Require' : 'Check email in'} ${header}`,
      );
      box.addEventListener('change', () => {
        if (!rules) return;
        rules = {
          ...rules,
          [kind]: box.checked
            ? [...rules[kind], index]
            : rules[kind].filter((value) => value !== index),
        };
        checkRules();
      });
      row.append(box);
    }
    columns.append(row);
  });
}
function render(): void {
  if (!analysis) return;
  el('count-total').textContent = analysis.rows.length.toLocaleString();
  el('count-valid').textContent = analysis.valid.toLocaleString();
  el('count-review').textContent = analysis.blocked.toLocaleString();
  el('count-duplicates').textContent = analysis.duplicates.toLocaleString();
  el('trim-count').textContent =
    `${analysis.trimmedCells.toLocaleString()} ${analysis.trimmedCells === 1 ? 'cell has' : 'cells have'} whitespace changes`;
  el('export-label').textContent = `Download ${analysis.valid.toLocaleString()} ready rows`;
  const query = el<HTMLInputElement>('search').value.toLocaleLowerCase(),
    status = el<HTMLSelectElement>('status-filter').value;
  const filtered = analysis.rows.filter(
    (row) =>
      (status === 'all' ||
        (status === 'review' ? row.issues.length > 0 : row.issues.length === 0)) &&
      (!query || row.values.some((value) => value.toLocaleLowerCase().includes(query))),
  );
  page = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const head = el('table-head');
  head.replaceChildren();
  for (const value of ['Record', 'Check', ...analysis.headers]) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = value;
    head.append(th);
  }
  const body = el('table-body');
  body.replaceChildren();
  for (const row of filtered.slice(page * pageSize, (page + 1) * pageSize)) {
    const tr = document.createElement('tr');
    if (row.issues.length) tr.className = 'review-row';
    const id = document.createElement('td'),
      inspect = document.createElement('button');
    inspect.textContent = String(row.number);
    inspect.className = 'record-button';
    inspect.setAttribute('aria-label', `Inspect record ${row.number}`);
    inspect.addEventListener('click', () => {
      el('record-title').textContent =
        `Record ${row.number} · ${row.issues.length ? 'Needs review' : 'Ready'}`;
      el('record-content').textContent = JSON.stringify(
        {
          headers: analysis!.headers,
          originalValues: row.original,
          processedValues: row.values,
          issues: row.issues,
        },
        null,
        2,
      );
      el<HTMLDialogElement>('record-dialog').showModal();
    });
    id.append(inspect);
    const state = document.createElement('td'),
      badge = document.createElement('span');
    badge.className = `badge ${row.issues.length ? 'review' : 'ready'}`;
    badge.textContent = row.issues.length ? 'Review' : 'Ready';
    state.append(badge);
    if (row.issues.length) {
      const detail = document.createElement('small');
      detail.textContent = row.issues.map((issue) => issue.message).join(' · ');
      state.append(detail);
    }
    tr.append(id, state);
    for (let i = 0; i < analysis.headers.length; i++) {
      const td = document.createElement('td'),
        value = row.values[i] ?? '';
      td.textContent = value.length > 100 ? `${value.slice(0, 100)}…` : value;
      td.title = value.slice(0, 2000);
      if (!value) td.className = 'empty-cell';
      tr.append(td);
    }
    body.append(tr);
  }
  el('no-matches').hidden = filtered.length > 0;
  el('page-info').textContent =
    `${filtered.length ? page * pageSize + 1 : 0}–${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length.toLocaleString()} matching records`;
  el<HTMLButtonElement>('previous').disabled = page === 0;
  el<HTMLButtonElement>('next').disabled = (page + 1) * pageSize >= filtered.length;
}
function download(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime })),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function basename(): string {
  return (
    filename
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 80) || 'data'
  );
}
el<HTMLInputElement>('file').addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void loadFile(file);
  input.value = '';
});
const drop = el('dropzone');
drop.addEventListener('dragover', (event) => {
  event.preventDefault();
  drop.classList.add('dragging');
});
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', (event) => {
  event.preventDefault();
  event.stopPropagation();
  drop.classList.remove('dragging');
  if (event.dataTransfer?.files.length !== 1) {
    message('Choose one CSV file at a time', true);
    return;
  }
  void loadFile(event.dataTransfer.files[0]!);
});
window.addEventListener('dragover', (event) => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
window.addEventListener('drop', (event) => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
el<HTMLButtonElement>('sample').addEventListener('click', () => {
  fileRevision++;
  loadText(demoCsv, 'team-contacts-example.csv');
});
el<HTMLButtonElement>('paste-open').addEventListener('click', () =>
  el<HTMLDialogElement>('paste-dialog').showModal(),
);
el<HTMLButtonElement>('paste-close').addEventListener('click', () =>
  el<HTMLDialogElement>('paste-dialog').close(),
);
el<HTMLFormElement>('paste-form').addEventListener('submit', (event) => {
  event.preventDefault();
  fileRevision++;
  loadText(el<HTMLTextAreaElement>('paste-data').value, 'pasted-data.csv');
  el<HTMLTextAreaElement>('paste-data').value = '';
  el<HTMLDialogElement>('paste-dialog').close();
});
el<HTMLButtonElement>('clear').addEventListener('click', () => {
  fileRevision++;
  revision++;
  checker.terminate();
  startWorker();
  source = '';
  analysis = undefined;
  rules = undefined;
  page = 0;
  el('workspace').hidden = true;
  el('loaded-file').hidden = true;
  el('table-body').replaceChildren();
  el('table-head').replaceChildren();
  el('column-rules').replaceChildren();
  el<HTMLSelectElement>('unique').replaceChildren();
  el('file-name').textContent = '';
  el('file-info').textContent = '';
  el('record-content').textContent = '';
  el<HTMLTextAreaElement>('paste-data').value = '';
  el<HTMLInputElement>('search').value = '';
  el<HTMLSelectElement>('status-filter').value = 'all';
  message('This app’s file data and preview have been cleared. Your original file is unchanged.');
});
el<HTMLSelectElement>('delimiter').addEventListener('change', () => {
  if (source) loadText(source, filename);
});
el<HTMLInputElement>('trim').addEventListener('change', () => {
  if (rules) {
    rules = { ...rules, trim: el<HTMLInputElement>('trim').checked };
    checkRules();
  }
});
el<HTMLInputElement>('deduplicate').addEventListener('change', () => {
  if (rules) {
    rules = { ...rules, deduplicate: el<HTMLInputElement>('deduplicate').checked };
    checkRules();
  }
});
el<HTMLSelectElement>('unique').addEventListener('change', () => {
  if (rules) {
    const value = el<HTMLSelectElement>('unique').value;
    rules = { ...rules, unique: value === '' ? null : Number(value) };
    checkRules();
  }
});
el<HTMLInputElement>('search').addEventListener('input', () => {
  page = 0;
  render();
});
el<HTMLSelectElement>('status-filter').addEventListener('change', () => {
  page = 0;
  render();
});
el<HTMLButtonElement>('previous').addEventListener('click', () => {
  page--;
  render();
});
el<HTMLButtonElement>('next').addEventListener('click', () => {
  page++;
  render();
});
el<HTMLButtonElement>('record-close').addEventListener('click', () =>
  el<HTMLDialogElement>('record-dialog').close(),
);
el<HTMLButtonElement>('export').addEventListener('click', () => {
  if (!analysis?.valid) return;
  try {
    const result = validCsv(analysis, delimiter, el<HTMLInputElement>('protect').checked);
    download(`${basename()}-ready.csv`, result.text, 'text/csv;charset=utf-8');
    message(
      `Downloaded ${analysis.valid} ready rows. ${analysis.blocked} review rows excluded. ${result.protectedCells} formula-like cells prefixed for spreadsheet safety.`,
    );
  } catch (error) {
    message(error instanceof Error ? error.message : 'Unable to export', true);
  }
});
el<HTMLButtonElement>('report').addEventListener('click', () => {
  if (analysis) {
    download(`${basename()}-review.json`, reviewJson(analysis), 'application/json');
    message('Review report downloaded with excluded records, original values and reasons.');
  }
});
