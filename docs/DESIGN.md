# Design and product behavior

## A complete import-preparation workflow

The user can start with a file, pasted text, or the included sample. The app distinguishes file-level errors, such as malformed quoting, from row-level problems, such as missing required values. A file-level error prevents export; row-level problems are reviewable and excluded only when the user downloads ready rows.

The core is independent of the DOM. Parsing yields a header array, raw string records and the delimiter. Analysis returns original values, processed values and grouped issues per record. The UI stores current rules, visible filter/page and the most recent accepted worker result. It never treats a filtered preview as the export dataset.

## Parser

The parser has four states: start of field, unquoted field, quoted field and closed quote. Quotes inside unquoted values and non-separator text after closing quotes are rejected. Doubled quotes become one literal quote. CRLF/LF/CR record endings are recognized outside quotes; line breaks inside quotes remain field content.

Delimiter inference counts separators outside quotes in up to 30 complete logical records. It does not parse each candidate with the column limit: otherwise a genuine over-wide comma file could incorrectly become a one-column semicolon file. Detection is heuristic; the manual selector is part of the product contract.

Empty quoted cells are data, while empty physical lines outside quotes are skipped. Exports quote empty values, which preserves a one-column record whose value is empty. File, field, column and record limits bound the worker's data structure.

## Rule ordering

Values are optionally trimmed, then checked for record width, required cells and email syntax. Unique keys and exact duplicate identities are reserved only by usable records. This prevents an invalid first occurrence from blocking a later valid record. A later repeated usable key needs review. Key and duplicate comparisons are exact and case-sensitive after selected normalization.

Required/email issues group column names into one issue per category, instead of creating an unbounded number of messages per row. Long issue summaries name the first five columns and count the rest. The preview renders at most 25 rows at once; record detail and JSON report retain original full values, including extra fields from ragged records.

## Exports

Ready-row export uses the full accepted analysis, regardless of current search or page. It excludes every record with a blocking issue and reports that count to the user. Quoting covers delimiters, quotes, newlines and empty values. Quotes are doubled; record separators are CRLF.

Formula protection detects formula-leading characters after whitespace and leading tab/CR/LF. It prefixes an apostrophe; it does not evaluate a formula or claim to neutralize every possible spreadsheet application. This can change negative numbers represented as text, so the choice is visible. If protection would collide two header names, export stops with a useful error rather than emitting ambiguous columns.

The review report is JSON, avoiding a second formula-bearing CSV. It includes excluded records, original values and explanations. The source itself is never overwritten.

## Asynchronous state and clearing

Parsing and analysis run in a module worker. Requests carry increasing IDs; old results cannot replace a newer file or rule state. File reads have a separate revision to prevent a slower old upload from winning. Clear terminates the worker, creates a clean one and removes data from the UI and application references. Browser memory reclamation is outside the app's control.

Column and cell strings render through `textContent`, not HTML. File data never enters query strings or persistent browser storage. Static assets load from the same origin; there are no service APIs, trackers or cross-origin fonts.

## Browser verification checklist

- Load the sample: 10 records, 7 ready, 3 review, 1 duplicate and 1 whitespace change.
- Require email: the empty-email record joins review; clear the requirement to restore it.
- Switch between ready/review filters and search; confirm summary counts do not become filtered counts.
- Inspect a multiline or ragged record and compare original/processed arrays.
- Download ready CSV and report; parse the results and verify exact records and formula protection.
- Paste malformed quoted CSV; confirm a file-level error and disabled export.
- Upload an independent UTF-8 semicolon file; verify detection and rule reset.
- Clear after viewing details and pasting; confirm old values are absent from the visible/hidden DOM.
- Inspect a narrow viewport and keyboard controls.
- Repeat the sample and download flow on the live Pages URL, not just localhost.

These checks accompany automated core tests; they are not a claim of a full independent accessibility audit or browser-matrix certification.
