import express from "express";
import { createApp } from "@forge/core";
import { runBenchmarkForUrl, type BenchmarkResult } from "./index.js";

export interface MiddlewareBenchmarkResult extends BenchmarkResult {
  framework: "Forge" | "Express";
  middlewareCount: number;
}

export interface MedianBenchmarkResult extends MiddlewareBenchmarkResult {
  overheadPercent: number;
  allReqPerSec: number[];
}

async function runSingleBenchmark(
  framework: "Forge" | "Express",
  middlewareCount: number,
): Promise<MiddlewareBenchmarkResult> {
  if (framework === "Forge") {
    const app = createApp();
    for (let i = 0; i < middlewareCount; i++) {
      app.use(async (_req, _res, next) => {
        await next();
      });
    }
    app.get("/test", (_req, res) => {
      res.json({ message: "Hello World" });
    });

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to get Forge server port");
    }

    const url = `http://127.0.0.1:${address.port}/test`;
    const label = `Forge (${middlewareCount} mw)`;
    const benchRes = await runBenchmarkForUrl(label, url);
    await app.close();

    return {
      ...benchRes,
      framework: "Forge",
      middlewareCount,
    };
  } else {
    const app = express();
    for (let i = 0; i < middlewareCount; i++) {
      app.use(async (_req, _res, next) => {
        await next();
      });
    }
    app.get("/test", (_req, res) => {
      res.json({ message: "Hello World" });
    });

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to get Express server port");
    }

    const url = `http://127.0.0.1:${address.port}/test`;
    const label = `Express (${middlewareCount} mw)`;
    const benchRes = await runBenchmarkForUrl(label, url);
    await new Promise<void>((resolve) => server.close(() => resolve()));

    return {
      ...benchRes,
      framework: "Express",
      middlewareCount,
    };
  }
}

export async function runMiddlewareBenchmark(
  runs = 3,
): Promise<MedianBenchmarkResult[]> {
  console.log("\n==================================================");
  console.log(` Forge vs Express Middleware Benchmark (${runs} Runs Median) `);
  console.log("==================================================\n");

  const schedule: Array<{ framework: "Forge" | "Express"; middlewareCount: number }> = [
    { framework: "Forge", middlewareCount: 0 },
    { framework: "Express", middlewareCount: 0 },
    { framework: "Express", middlewareCount: 1 },
    { framework: "Forge", middlewareCount: 1 },
    { framework: "Forge", middlewareCount: 5 },
    { framework: "Express", middlewareCount: 5 },
    { framework: "Express", middlewareCount: 10 },
    { framework: "Forge", middlewareCount: 10 },
  ];

  const resultsMap = new Map<string, MiddlewareBenchmarkResult[]>();

  for (let run = 1; run <= runs; run++) {
    console.log(`--- Iteration Run ${run} of ${runs} ---`);
    for (const step of schedule) {
      const key = `${step.framework}-${step.middlewareCount}`;
      console.log(`Benchmarking ${step.framework} (${step.middlewareCount} mw)...`);
      const res = await runSingleBenchmark(step.framework, step.middlewareCount);
      const list = resultsMap.get(key) ?? [];
      list.push(res);
      resultsMap.set(key, list);
    }
  }

  const configOrder: Array<{ framework: "Forge" | "Express"; middlewareCount: number }> = [
    { framework: "Forge", middlewareCount: 0 },
    { framework: "Forge", middlewareCount: 1 },
    { framework: "Forge", middlewareCount: 5 },
    { framework: "Forge", middlewareCount: 10 },
    { framework: "Express", middlewareCount: 0 },
    { framework: "Express", middlewareCount: 1 },
    { framework: "Express", middlewareCount: 5 },
    { framework: "Express", middlewareCount: 10 },
  ];

  const mediansMap = new Map<string, MiddlewareBenchmarkResult>();

  for (const step of configOrder) {
    const key = `${step.framework}-${step.middlewareCount}`;
    const runsList = resultsMap.get(key) ?? [];
    runsList.sort((a, b) => a.requestsPerSec - b.requestsPerSec);
    const medianIndex = Math.floor(runsList.length / 2);
    mediansMap.set(key, runsList[medianIndex]);
  }

  const forgeBaseline = mediansMap.get("Forge-0")!.requestsPerSec;
  const expressBaseline = mediansMap.get("Express-0")!.requestsPerSec;

  const medianResults: MedianBenchmarkResult[] = [];

  for (const step of configOrder) {
    const key = `${step.framework}-${step.middlewareCount}`;
    const medianRes = mediansMap.get(key)!;
    const runsList = resultsMap.get(key) ?? [];
    const baseline = step.framework === "Forge" ? forgeBaseline : expressBaseline;
    const overheadPercent = ((baseline - medianRes.requestsPerSec) / baseline) * 100;

    medianResults.push({
      ...medianRes,
      overheadPercent,
      allReqPerSec: runsList.map((r) => Math.round(r.requestsPerSec)),
    });
  }

  console.log("\nMiddleware Performance Results (Median of 3 Runs):");
  console.table(
    medianResults.map((r) => ({
      Framework: r.framework,
      "Middleware Count": r.middlewareCount,
      "Req/Sec (Median)": Math.round(r.requestsPerSec),
      "Avg Latency (ms)": r.avgLatencyMs.toFixed(3),
      "p50 (ms)": r.p50Ms.toFixed(3),
      "p95 (ms)": r.p95Ms.toFixed(3),
      "p99 (ms)": r.p99Ms.toFixed(3),
      Errors: r.errorCount,
      "Overhead vs 0-MW (%)": r.overheadPercent.toFixed(2) + "%",
    })),
  );

  return medianResults;
}
