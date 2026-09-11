import { request as httpRequest } from "node:http";
import express from "express";
import { createApp } from "@forge/core";

interface BenchmarkResult {
  name: string;
  totalRequests: number;
  durationMs: number;
  requestsPerSec: number;
  avgLatencyMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorCount: number;
  memoryUsageMb: number;
}

function calculatePercentile(latencies: number[], percentile: number): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function runBenchmarkForUrl(
  name: string,
  urlStr: string,
  totalRequests = 5000,
  concurrency = 20,
): Promise<BenchmarkResult> {
  const url = new URL(urlStr);
  const latencies: number[] = [];
  let errorCount = 0;
  let completed = 0;

  const startMemory = process.memoryUsage().heapUsed;

  const makeRequest = (): Promise<void> => {
    return new Promise((resolve) => {
      const reqStart = performance.now();
      const req = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "GET",
          agent: false,
        },
        (res) => {
          res.resume();
          res.once("end", () => {
            const reqEnd = performance.now();
            if (res.statusCode === 200) {
              latencies.push(reqEnd - reqStart);
            } else {
              errorCount++;
            }
            completed++;
            resolve();
          });
        },
      );

      req.once("error", () => {
        errorCount++;
        completed++;
        resolve();
      });

      req.end();
    });
  };

  // Run initial warm-up requests
  for (let i = 0; i < 100; i++) {
    await makeRequest();
  }
  latencies.length = 0;
  errorCount = 0;
  completed = 0;

  const benchStartTime = performance.now();

  // Run concurrent batches
  const workers = Array.from({ length: concurrency }, async () => {
    while (completed < totalRequests) {
      await makeRequest();
    }
  });

  await Promise.all(workers);

  const benchEndTime = performance.now();
  const durationMs = benchEndTime - benchStartTime;
  const endMemory = process.memoryUsage().heapUsed;
  const memoryUsageMb = Math.max(0, (endMemory - startMemory) / (1024 * 1024));

  const sumLatency = latencies.reduce((a, b) => a + b, 0);
  const avgLatencyMs = latencies.length > 0 ? sumLatency / latencies.length : 0;

  return {
    name,
    totalRequests: latencies.length + errorCount,
    durationMs,
    requestsPerSec: (latencies.length / durationMs) * 1000,
    avgLatencyMs,
    p50Ms: calculatePercentile(latencies, 50),
    p95Ms: calculatePercentile(latencies, 95),
    p99Ms: calculatePercentile(latencies, 99),
    errorCount,
    memoryUsageMb,
  };
}

async function main() {
  console.log("Starting Forge vs Express Benchmark Baseline...\n");

  // 1. Setup Forge Server
  const forgeApp = createApp();
  forgeApp.get("/json", (_req, res) => {
    res.json({ message: "Hello World" });
  });
  const forgeServer = forgeApp.listen(0);
  await new Promise<void>((resolve) => forgeServer.once("listening", resolve));
  const forgeAddress = forgeServer.address();
  if (!forgeAddress || typeof forgeAddress === "string") {
    throw new Error("Failed to get Forge server port");
  }

  // 2. Setup Express Server
  const expressApp = express();
  expressApp.get("/json", (_req, res) => {
    res.json({ message: "Hello World" });
  });
  const expressServer = expressApp.listen(0);
  await new Promise<void>((resolve) => expressServer.once("listening", resolve));
  const expressAddress = expressServer.address();
  if (!expressAddress || typeof expressAddress === "string") {
    throw new Error("Failed to get Express server port");
  }

  try {
    const forgeUrl = `http://127.0.0.1:${forgeAddress.port}/json`;
    const expressUrl = `http://127.0.0.1:${expressAddress.port}/json`;

    console.log(`Running Forge benchmark at ${forgeUrl}...`);
    const forgeResults = await runBenchmarkForUrl("Forge", forgeUrl);

    console.log(`Running Express benchmark at ${expressUrl}...\n`);
    const expressResults = await runBenchmarkForUrl("Express", expressUrl);

    console.table([
      {
        Framework: forgeResults.name,
        "Req/Sec": Math.round(forgeResults.requestsPerSec),
        "Avg Latency (ms)": forgeResults.avgLatencyMs.toFixed(3),
        "p50 (ms)": forgeResults.p50Ms.toFixed(3),
        "p95 (ms)": forgeResults.p95Ms.toFixed(3),
        "p99 (ms)": forgeResults.p99Ms.toFixed(3),
        Errors: forgeResults.errorCount,
      },
      {
        Framework: expressResults.name,
        "Req/Sec": Math.round(expressResults.requestsPerSec),
        "Avg Latency (ms)": expressResults.avgLatencyMs.toFixed(3),
        "p50 (ms)": expressResults.p50Ms.toFixed(3),
        "p95 (ms)": expressResults.p95Ms.toFixed(3),
        "p99 (ms)": expressResults.p99Ms.toFixed(3),
        Errors: expressResults.errorCount,
      },
    ]);
  } finally {
    await forgeApp.close();
    await new Promise<void>((resolve) => expressServer.close(() => resolve()));
  }
}

void main();
