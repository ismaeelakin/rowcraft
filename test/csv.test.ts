import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, dataset, inferDelimiter, CsvError } from '../src/csv.js';
import { csvText } from '../src/export.js';

test('commas, quotes, multiline cells, empty fields and CRLF are parsed exactly', () => {
  assert.deepEqual(
    parseCsv('name,notes,empty\r\n"Ada, M.","She said ""hello""",\r\nInes,"first\r\nsecond",x\r\n'),
    [
      ['name', 'notes', 'empty'],
      ['Ada, M.', 'She said "hello"', ''],
      ['Ines', 'first\r\nsecond', 'x'],
    ],
  );
});
test('BOM, Unicode, blank lines and a final unterminated-by-newline record work', () => {
  assert.deepEqual(parseCsv('\ufeffname,value\n\nAmira,café\n"",x'), [
    ['name', 'value'],
    ['Amira', 'café'],
    ['', 'x'],
  ]);
  assert.deepEqual(parseCsv('a;b\r1;2', ';'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
  assert.deepEqual(parseCsv('a\tb\n1\t2', '\t'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});
test('malformed quoting is rejected with a physical line and column', () => {
  for (const input of ['a,b\n1,"open', 'a,b\n1,ba"d', 'a,b\n1,"closed"extra', 'a,b\n1,\0'])
    assert.throws(() => parseCsv(input), CsvError);
  try {
    parseCsv('a,b\n1,"x"y');
    assert.fail('must reject');
  } catch (error) {
    assert.equal((error as CsvError).line, 2);
    assert.equal((error as CsvError).column, 6);
  }
});
test('auto detection respects quoted delimiters and complete multiline records', () => {
  assert.equal(inferDelimiter('name;notes\nAda;"commas, inside, quotes"\nLeo;ok'), ';');
  assert.equal(inferDelimiter('name\tvalue\nAda\tx'), '\t');
  assert.equal(inferDelimiter('name,notes\nAda,"a\nb,c;d"'), ',');
  assert.equal(inferDelimiter('single\na;b;c'), ',');
  const large = `name;notes\nAda;"${'a'.repeat(70_000)}\nmore"\nLeo;ok`;
  assert.equal(dataset(large).delimiter, ';');
});
test('headers must be useful and unambiguous', () => {
  for (const input of ['', '\n\n', ',name\n1,2', 'Name,name\n1,2', `${'x'.repeat(121)}\n1`])
    assert.throws(() => dataset(input));
  assert.deepEqual(dataset(' name , email \nAda,ada@example.test').headers, ['name', 'email']);
});
test('limits reject oversized data rather than silently changing its delimiter', () => {
  assert.throws(
    () =>
      dataset(
        Array.from({ length: 51 }, (_, i) => `c${i}`).join(',') +
          '\n' +
          Array(51).fill('x').join(','),
      ),
    /50 columns/,
  );
  assert.throws(() => parseCsv('header\n' + 'a'.repeat(100_001)), /100000 characters/);
  assert.throws(() => parseCsv('h\n' + Array(20_001).fill('x').join('\n')), /20000 data rows/);
  assert.throws(() => parseCsv('é'.repeat(1_600_000)), /3 MiB/);
});
test('deterministic round-trip cases preserve delimiters, quotes and line breaks', () => {
  let seed = 42;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const alphabet = ['a', ' ', ',', ';', '\t', '\n', '\r', '"', 'é', '中', '='];
  for (const delimiter of [',', ';', '\t'] as const) {
    for (let run = 0; run < 40; run++) {
      const width = (random() % 6) + 1;
      const rows = Array.from({ length: 15 }, () =>
        Array.from({ length: width }, () =>
          Array.from({ length: random() % 18 }, () => alphabet[random() % alphabet.length]).join(
            '',
          ),
        ),
      );
      assert.deepEqual(parseCsv(csvText(rows, delimiter, false).text, delimiter), rows);
    }
  }
});
