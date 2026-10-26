import test from 'node:test';
import assert from 'node:assert/strict';
import { csvText, validCsv, reviewJson, formulaLike } from '../src/export.js';
import { parseCsv, dataset } from '../src/csv.js';
import { analyze, defaults } from '../src/quality.js';

test('export quotes empty cells and escapes embedded double quotes', () => {
  assert.deepEqual(parseCsv(csvText([[''], ['a"b'], ['line\nbreak']], ',', false).text), [
    [''],
    ['a"b'],
    ['line\nbreak'],
  ]);
});
test('spreadsheet protection covers formulas, leading whitespace and negative cells', () => {
  for (const value of ['=1+2', '+42', '-42', '@SUM(A1)', '  =1', '\tplain', '\rtext'])
    assert.equal(formulaLike(value), true);
  const values = [['value'], ['=1+2'], ['-42'], ['plain']];
  const exported = csvText(values);
  assert.equal(exported.protectedCells, 2);
  assert.deepEqual(parseCsv(exported.text), [['value'], ["'=1+2"], ["'-42"], ['plain']]);
  assert.deepEqual(parseCsv(csvText(values, ',', false).text), values);
});
test('only eligible rows export and the report retains original rejected values', () => {
  const data = dataset('name,email\n Ada ,bad-email\nLeo,leo@example.test');
  const result = analyze(data, defaults(data.headers));
  assert.deepEqual(parseCsv(validCsv(result, ',', false).text), [
    ['name', 'email'],
    ['Leo', 'leo@example.test'],
  ]);
  const report = JSON.parse(reviewJson(result));
  assert.equal(report.excludedRows, 1);
  assert.deepEqual(report.rows[0].originalValues, [' Ada ', 'bad-email']);
});
test('headers are protected too, and protection collisions prevent export', () => {
  const data = dataset('=header\nx'),
    result = analyze(data, defaults(data.headers));
  assert.equal(parseCsv(validCsv(result, ',', true).text)[0]![0], "'=header");
  const collision = dataset("=header,'=header\na,b");
  assert.throws(
    () => validCsv(analyze(collision, defaults(collision.headers)), ',', true),
    /ambiguous/,
  );
});
test('semicolon output and multiline data preserve their exact values', () => {
  const data = dataset('name;note\nAda;"a;b\nnext"', ';');
  assert.deepEqual(
    parseCsv(validCsv(analyze(data, defaults(data.headers)), ';', false).text, ';'),
    [
      ['name', 'note'],
      ['Ada', 'a;b\nnext'],
    ],
  );
});
