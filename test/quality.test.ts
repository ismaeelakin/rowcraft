import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, defaults, type Rules } from '../src/quality.js';
import { dataset } from '../src/csv.js';
import { demoCsv } from '../src/sample.js';

test('sample is real data with predictable review outcomes', () => {
  const data = dataset(demoCsv),
    result = analyze(data, defaults(data.headers));
  assert.equal(result.rows.length, 10);
  assert.equal(result.valid, 7);
  assert.equal(result.blocked, 3);
  assert.equal(result.duplicates, 1);
  assert.equal(result.trimmedCells, 1);
});
test('required checks, simple email checks and shape checks are independent', () => {
  const data = dataset('name,email\nAda,\nLeo,bad-email\nInes,ines@example.test,extra');
  const rules: Rules = { ...defaults(data.headers), required: [1] };
  const result = analyze(data, rules);
  assert.deepEqual(
    result.rows.map((row) => row.issues.map((issue) => issue.code)),
    [['required'], ['email'], ['shape']],
  );
});
test('normalization is optional and never mutates original values', () => {
  const data = dataset('name,value\n Ada , 4 '),
    original = JSON.stringify(data);
  const trimmed = analyze(data, defaults(data.headers));
  assert.deepEqual(trimmed.rows[0]!.values, ['Ada', '4']);
  assert.deepEqual(trimmed.rows[0]!.original, [' Ada ', ' 4 ']);
  assert.deepEqual(analyze(data, { ...defaults(data.headers), trim: false }).rows[0]!.values, [
    ' Ada ',
    ' 4 ',
  ]);
  assert.equal(JSON.stringify(data), original);
});
test('a rejected first row does not reserve a later valid unique key', () => {
  const data = dataset(
    'id,email\nx,bad\nx,ada@example.test\nx,leo@example.test\n,ines@example.test',
  );
  const result = analyze(data, { ...defaults(data.headers), unique: 0 });
  assert.equal(result.valid, 1);
  assert.equal(result.rows[1]!.issues.length, 0);
  assert.equal(result.rows[2]!.issues[0]!.code, 'key');
  assert.equal(result.rows[3]!.issues[0]!.code, 'key');
});
test('duplicate detection is exact, case sensitive and configurable', () => {
  const data = dataset('name\nAda\n Ada \nada');
  assert.equal(analyze(data, defaults(data.headers)).valid, 2);
  assert.equal(analyze(data, { ...defaults(data.headers), deduplicate: false }).valid, 3);
  assert.equal(analyze(data, { ...defaults(data.headers), trim: false }).valid, 3);
});
test('rule indices and issue growth are bounded', () => {
  const data = dataset('a,b\n,');
  assert.throws(
    () => analyze(data, { ...defaults(data.headers), required: [8] }),
    /unknown column/,
  );
  const result = analyze(data, {
    ...defaults(data.headers),
    required: [0, 1],
    email: [0, 1],
    unique: 0,
  });
  assert.equal(result.rows[0]!.issues.length, 2);
});
