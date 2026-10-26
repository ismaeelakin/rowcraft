# Parse and check benchmark

This benchmark measures the pure CSV parser and default row checks together. It does not measure file selection, worker startup, message copying, table rendering, downloads or total browser responsiveness.

## Reproduce

```sh
npm ci
npm run benchmark
```

The script generates deterministic five-column CSV files with 1,000, 10,000 and 20,000 unique valid records. Notes contain quoted commas. Each case has three warmup runs and 20 measured runs. It asserts that every generated row passes the checks before reporting timings.

Median is the average of sorted samples 10 and 11. The reported p95 batch time is the nearest-rank 95th percentile of the 20 complete parse-and-check runs, not a percentile over individual records.

## Recorded local baseline

Measured October 26, 2026 with Node v22.17.1 on Windows x64. This was an ordinary desktop session with other work running; CPU frequency, background load and garbage collection were not controlled. The machine's hardware is not specified, so these values should not be used for machine-to-machine comparisons.

| Data records | UTF-8 bytes | Median batch time | p95 batch time |
| ------------ | ----------- | ----------------- | -------------- |
| 1,000        | 61,584      | 9.829 ms          | 59.900 ms      |
| 10,000       | 655,584     | 148.034 ms        | 223.102 ms     |
| 20,000       | 1,355,584   | 413.833 ms        | 615.981 ms     |

[Raw baseline](performance-baseline.json) · [Benchmark source](../scripts/benchmark.mjs)

The spread between the median and p95 is a reason to retain raw context and repeat measurements on the target browser and machine. It is not evidence of a universal speed guarantee or superiority over another CSV tool.

## What this reveals and what remains

The measured path handles the documented 20,000-record limit with valid input. This fixture does not cover every allowed shape: wider rows, long fields, invalid records and issue-heavy data can have different costs. No peak-memory claim is made.

The next measurement should use real browser interaction traces, including worker message transfer and rendering, on representative desktop and mobile hardware. Parser optimization should follow that evidence rather than a single run.
