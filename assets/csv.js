export const limits = {
    bytes: 3 * 1024 * 1024,
    dataRows: 20_000,
    columns: 50,
    fieldCharacters: 100_000,
};
export class CsvError extends Error {
    line;
    column;
    constructor(message, line, column) {
        super(`${message} (line ${line}, column ${column})`);
        this.line = line;
        this.column = column;
    }
}
export function parseCsv(input, delimiter = ',') {
    if (![',', ';', '\t'].includes(delimiter))
        throw new Error('Unsupported delimiter');
    if (new TextEncoder().encode(input).length > limits.bytes)
        throw new Error('File exceeds the 3 MiB limit');
    const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
    const rows = [];
    let row = [], field = '', state = 'start', touched = false;
    const fail = (message, offset) => {
        const lines = source.slice(0, offset).split(/\r\n|\r|\n/);
        throw new CsvError(message, lines.length, lines.at(-1).length + 1);
    };
    const pushField = (offset) => {
        row.push(field);
        field = '';
        state = 'start';
        if (row.length > limits.columns)
            fail('More than 50 columns', offset);
    };
    const pushRow = (offset) => {
        if (touched || row.length || field.length) {
            pushField(offset);
            rows.push(row);
            if (rows.length > limits.dataRows + 1)
                fail('More than 20000 data rows', offset);
        }
        row = [];
        field = '';
        state = 'start';
        touched = false;
    };
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (char === '\0')
            fail('NUL bytes are not supported', i);
        if (state === 'quoted') {
            if (char === '"') {
                if (source[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else
                    state = 'closed';
            }
            else
                field += char;
        }
        else if (char === delimiter) {
            touched = true;
            pushField(i);
        }
        else if (char === '\n' || char === '\r') {
            pushRow(i);
            if (char === '\r' && source[i + 1] === '\n')
                i++;
        }
        else if (state === 'closed')
            fail('Unexpected text after a closing quote', i);
        else if (char === '"') {
            if (state === 'plain')
                fail('Quote inside an unquoted field', i);
            state = 'quoted';
            touched = true;
        }
        else {
            field += char;
            state = 'plain';
            touched = true;
        }
        if (field.length > limits.fieldCharacters)
            fail('Field exceeds 100000 characters', i);
    }
    if (state === 'quoted')
        fail('Quoted field is not closed', source.length);
    pushRow(source.length);
    return rows;
}
export function inferDelimiter(input) {
    // Count separators outside quotes in at most 30 complete logical records.
    // Do not parse candidates here: a real 51-column comma file must fail the
    // column limit, rather than being silently reinterpreted as one semicolon column.
    const candidates = [',', ';', '\t'];
    const widths = [];
    let counts = [1, 1, 1], quoted = false, touched = false;
    for (let i = 0; i < input.length && widths.length < 30; i++) {
        const char = input[i];
        if (char === '"') {
            touched = true;
            if (quoted && input[i + 1] === '"')
                i++;
            else
                quoted = !quoted;
        }
        else if (!quoted && (char === '\r' || char === '\n')) {
            if (touched)
                widths.push(counts);
            counts = [1, 1, 1];
            touched = false;
            if (char === '\r' && input[i + 1] === '\n')
                i++;
        }
        else {
            touched = true;
            if (!quoted)
                for (let j = 0; j < candidates.length; j++)
                    if (char === candidates[j])
                        counts[j] = counts[j] + 1;
        }
    }
    if (touched && widths.length < 30)
        widths.push(counts);
    let best = ',', bestScore = -1;
    for (let j = 0; j < candidates.length; j++) {
        const width = widths[0]?.[j] ?? 1;
        const consistent = widths.filter((row) => row[j] === width).length;
        const score = width > 1 ? (consistent / Math.max(1, widths.length)) * 100 + width : 0;
        if (score > bestScore) {
            best = candidates[j];
            bestScore = score;
        }
    }
    return best;
}
export function dataset(input, delimiter = 'auto') {
    const chosen = delimiter === 'auto' ? inferDelimiter(input) : delimiter;
    const rows = parseCsv(input, chosen), headers = rows.shift()?.map((value) => value.trim());
    if (!headers?.length)
        throw new Error('Choose a CSV file with a header row');
    if (headers.some((header) => !header))
        throw new Error('Every column needs a nonempty header');
    if (headers.some((header) => header.length > 120))
        throw new Error('Column headers must contain at most 120 characters');
    const keys = headers.map((header) => header.toLocaleLowerCase('en-US'));
    if (new Set(keys).size !== keys.length)
        throw new Error('Column headers must be unique, ignoring case');
    return { headers, rows, delimiter: chosen };
}
