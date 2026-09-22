# Benchmarking

Kyuu includes a dedicated benchmarking package (`@kyuujs/benchmark`) located in [`packages/benchmark`](../packages/benchmark).

The benchmark package measures framework overhead and compares performance against Express.js under equivalent workloads.

---

## Running Benchmarks

Run the benchmark suite using pnpm:

```bash
pnpm benchmark
```

This script builds the monorepo packages and executes the benchmark suite in Node.js.

---

## Measured Metrics

The benchmark suite tracks:

- **Throughput:** Requests per second (`req/sec`)
- **Latency Percentiles:**
  - `p50` (Median latency)
  - `p95` (95th percentile latency)
  - `p99` (99th percentile latency)
- **Error Rates:** Number of failed requests
- **Memory & CPU:** Process resource utilization during load testing

---

## Performance Targets

- **Express Baseline:** Kyuu must maintain throughput and latency at least comparable to Express.js under equivalent workloads.
- **Hot-Path Optimization:** Allocations during request dispatch, route matching, and header generation are minimized to avoid unnecessary garbage collection overhead.
