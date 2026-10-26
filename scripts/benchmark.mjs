import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { dataset } from '../site/assets/csv.js';
import { analyze, defaults } from '../site/assets/quality.js';

const repetitions = 20;
const fixtures = [1000, 10000, 20000];
const results = [];
for (const count of fixtures) {
  const lines = ['id,name,email,team,notes'];
  for (let i = 0; i < count; i++) {
    lines.push(`${i},Person ${i},person${i}@example.test,Operations,"note, ${i}"`);
  }
  const csv = lines.join('\r\n');
  const run = () => {
    const started = performance.now();
    const data = dataset(csv);
    const checked = analyze(data, defaults(data.headers));
    const elapsed = performance.now() - started;
    assert.equal(checked.valid, count);
    assert.equal(checked.blocked, 0);
    return elapsed;
  };
  for (let i = 0; i < 3; i++) run();
  const durations = Array.from({ length: repetitions }, run).sort((a, b) => a - b);
  results.push({
    rows: count,
    bytes: Buffer.byteLength(csv),
    repetitions,
    medianMs: Number(((durations[9] + durations[10]) / 2).toFixed(3)),
    p95BatchMs: Number(durations[18].toFixed(3)),
  });
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      workload: 'Parse CSV and apply default checks; no DOM or worker messaging',
      warmupRuns: 3,
      results,
    },
    null,
    2,
  ),
);
