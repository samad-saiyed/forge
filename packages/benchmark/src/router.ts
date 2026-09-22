import { performance } from "node:perf_hooks";
import { Router } from "@kyuujs/core";

interface LookupStats {
  lookupTimeMs: number;
  lookupsPerSec: number;
}

interface BenchmarkScaleResult {
  routes: number;
  registrationTimeMs: number;
  memoryMb: number;
  successful: LookupStats;
  missing: LookupStats;
}

async function runSuite(
  title: string,
  createRoutePath: (i: number) => string,
  createSuccPath: (i: number, scale: number) => string,
  createMissPath: (i: number, scale: number) => string,
): Promise<void> {
  const scales = [10, 100, 1000, 10000];
  const lookupCount = 10000;
  const dummyHandler = () => {};

  console.log(`\n=== ${title} ===`);

  const results: BenchmarkScaleResult[] = [];

  for (const scale of scales) {
    if (global.gc) {
      global.gc();
    }
    const memBefore = process.memoryUsage().heapUsed;

    const regStart = performance.now();
    const router = new Router();
    for (let i = 0; i < scale; i++) {
      router.add("GET", createRoutePath(i), dummyHandler);
    }
    const regEnd = performance.now();
    const registrationTimeMs = regEnd - regStart;

    const memAfter = process.memoryUsage().heapUsed;
    const memoryMb = Math.max(0, (memAfter - memBefore) / (1024 * 1024));

    // Warm-up successful lookups
    for (let i = 0; i < 100; i++) {
      router.find("GET", createSuccPath(i, scale));
    }

    // Measure successful lookups
    const succStart = performance.now();
    for (let i = 0; i < lookupCount; i++) {
      router.find("GET", createSuccPath(i, scale));
    }
    const succEnd = performance.now();
    const succDuration = succEnd - succStart;
    const succLookupsPerSec = Math.round((lookupCount / succDuration) * 1000);

    // Warm-up missing lookups
    for (let i = 0; i < 100; i++) {
      router.find("GET", createMissPath(i, scale));
    }

    // Measure missing lookups
    const missStart = performance.now();
    for (let i = 0; i < lookupCount; i++) {
      router.find("GET", createMissPath(i, scale));
    }
    const missEnd = performance.now();
    const missDuration = missEnd - missStart;
    const missLookupsPerSec = Math.round((lookupCount / missDuration) * 1000);

    results.push({
      routes: scale,
      registrationTimeMs,
      memoryMb,
      successful: {
        lookupTimeMs: succDuration,
        lookupsPerSec: succLookupsPerSec,
      },
      missing: {
        lookupTimeMs: missDuration,
        lookupsPerSec: missLookupsPerSec,
      },
    });
  }

  console.log(`\n${title} (Successful Lookups - 10,000 iterations):`);
  console.table(
    results.map((r) => ({
      Routes: r.routes,
      "Registration (ms)": r.registrationTimeMs.toFixed(3),
      "Lookup Time (ms)": r.successful.lookupTimeMs.toFixed(3),
      "Lookups/Sec": r.successful.lookupsPerSec.toLocaleString(),
      "Memory (MB)": r.memoryMb.toFixed(3),
    })),
  );

  console.log(`\n${title} (Missing Route Lookups - 10,000 iterations):`);
  console.table(
    results.map((r) => ({
      Routes: r.routes,
      "Registration (ms)": r.registrationTimeMs.toFixed(3),
      "Lookup Time (ms)": r.missing.lookupTimeMs.toFixed(3),
      "Lookups/Sec": r.missing.lookupsPerSec.toLocaleString(),
      "Memory (MB)": r.memoryMb.toFixed(3),
    })),
  );
}

export async function runRouterBenchmark(): Promise<void> {
  await runSuite(
    "Static Routes Benchmark",
    (i) => `/users/${i}`,
    (i, scale) => `/users/${i % scale}`,
    (i, scale) => `/missing/${i % scale}`,
  );

  await runSuite(
    "Dynamic Routes Benchmark",
    (i) => `/res${i}/:id`,
    (i, scale) => `/res${i % scale}/123`,
    (i, scale) => `/missing${i % scale}/123`,
  );
}
