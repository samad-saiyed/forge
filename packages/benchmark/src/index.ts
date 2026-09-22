import type { EventEmitter } from "node:events";
import { request as httpRequest, type RequestOptions } from "node:http";
import express from "express";
import { z } from "zod";
import { createApp, defineRoute, type KyuuRequest, type KyuuResponse } from "@kyuujs/core";
import { runBodyParserBenchmark } from "./body-parser.js";
import { runMiddlewareBenchmark } from "./middleware.js";
import { runRouterBenchmark } from "./router.js";

export { runBodyParserBenchmark } from "./body-parser.js";
export { runMiddlewareBenchmark } from "./middleware.js";
export { runProductionBaseline } from "./production-baseline.js";
export { runRouterBenchmark } from "./router.js";

export interface BenchmarkResult {
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

export async function runBenchmarkForUrl(
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
          (res as unknown as EventEmitter).once("end", () => {
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

async function runPostBenchmarkForUrl(
  name: string,
  urlStr: string,
  body: string,
  totalRequests = 5000,
  concurrency = 20,
): Promise<BenchmarkResult> {
  const url = new URL(urlStr);
  const latencies: number[] = [];
  let errorCount = 0;
  let completed = 0;

  const makeRequest = (): Promise<void> => {
    return new Promise((resolve) => {
      const reqStart = performance.now();

      const options: RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
        agent: false,
      };

      const req = httpRequest(options, (res) => {
        res.resume();

        (res as unknown as EventEmitter).once("end", () => {
          const reqEnd = performance.now();

          if (res.statusCode === 200) {
            latencies.push(reqEnd - reqStart);
          } else {
            errorCount++;
          }

          completed++;
          resolve();
        });
      });

      req.once("error", () => {
        errorCount++;
        completed++;
        resolve();
      });

      req.end(body);
    });
  };

  for (let i = 0; i < 100; i++) {
    await makeRequest();
  }

  const benchStartTime = performance.now();

  const workers = Array.from({ length: concurrency }, async () => {
    while (completed < totalRequests) {
      await makeRequest();
    }
  });

  await Promise.all(workers);

  const durationMs = performance.now() - benchStartTime;

  const sumLatency = latencies.reduce((a, b) => a + b, 0);

  return {
    name,
    totalRequests: latencies.length + errorCount,
    durationMs,
    requestsPerSec: (latencies.length / durationMs) * 1000,
    avgLatencyMs: latencies.length > 0 ? sumLatency / latencies.length : 0,
    p50Ms: calculatePercentile(latencies, 50),
    p95Ms: calculatePercentile(latencies, 95),
    p99Ms: calculatePercentile(latencies, 99),
    errorCount,
    memoryUsageMb: 0,
  };
}

async function runHttpBenchmark(): Promise<void> {
  console.log("Starting Kyuu vs Express Benchmark Baseline...\n");

  // 1. Setup Kyuu Server
  const kyuuApp = createApp();
  kyuuApp.get("/json", (_req: KyuuRequest, res: KyuuResponse) => {
    res.json({ message: "Hello World" });
  });
  kyuuApp.post("/json", async (req: KyuuRequest, res: KyuuResponse) => {
    await req.parseBody();
    res.json({ message: "Hello World" });
  });

  const BodyZodSchema = z.object({
    name: z.string(),
    version: z.number(),
    framework: z.boolean(),
  });

  const ResponseZodSchema = z.object({
    message: z.string(),
  });

  kyuuApp.post(
    "/validated-json",
    defineRoute(
      { validate: { body: BodyZodSchema } },
      async (req: KyuuRequest, res: KyuuResponse) => {
        const body = await req.body;
        res.json(body);
      },
    ),
  );

  kyuuApp.get(
    "/response-schema-json",
    defineRoute({ response: ResponseZodSchema }, (_req: KyuuRequest, res: KyuuResponse) => {
      res.json({ message: "Hello World" });
    }),
  );
  const kyuuServer = kyuuApp.listen(0);
  await new Promise<void>((resolve) => kyuuServer.once("listening", resolve));
  const kyuuAddress = kyuuServer.address();
  if (!kyuuAddress || typeof kyuuAddress === "string") {
    throw new Error("Failed to get Kyuu server port");
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
    const kyuuUrl = `http://127.0.0.1:${kyuuAddress.port}/json`;
    const expressUrl = `http://127.0.0.1:${expressAddress.port}/json`;

    const kyuuResponseUrl = `http://127.0.0.1:${kyuuAddress.port}/response-schema-json`;

    console.log(`Running Kyuu benchmark at ${kyuuUrl}...`);
    const kyuuResults = await runBenchmarkForUrl("Kyuu", kyuuUrl);

    console.log(`Running Kyuu (Response Schema) benchmark at ${kyuuResponseUrl}...`);
    const kyuuResponseResults = await runBenchmarkForUrl("Kyuu (Resp Schema)", kyuuResponseUrl);

    console.log(`Running Express benchmark at ${expressUrl}...\n`);
    const expressResults = await runBenchmarkForUrl("Express", expressUrl);

    console.table([
      {
        Framework: kyuuResults.name,
        "Req/Sec": Math.round(kyuuResults.requestsPerSec),
        "Avg Latency (ms)": kyuuResults.avgLatencyMs.toFixed(3),
        "p50 (ms)": kyuuResults.p50Ms.toFixed(3),
        "p95 (ms)": kyuuResults.p95Ms.toFixed(3),
        "p99 (ms)": kyuuResults.p99Ms.toFixed(3),
        Errors: kyuuResults.errorCount,
      },
      {
        Framework: kyuuResponseResults.name,
        "Req/Sec": Math.round(kyuuResponseResults.requestsPerSec),
        "Avg Latency (ms)": kyuuResponseResults.avgLatencyMs.toFixed(3),
        "p50 (ms)": kyuuResponseResults.p50Ms.toFixed(3),
        "p95 (ms)": kyuuResponseResults.p95Ms.toFixed(3),
        "p99 (ms)": kyuuResponseResults.p99Ms.toFixed(3),
        Errors: kyuuResponseResults.errorCount,
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

    const body = JSON.stringify({
      name: "Kyuu",
      version: 1,
      framework: true,
    });

    console.log(
      "\nRunning Kyuu JSON body benchmark (without validation vs with Zod validation)...",
    );

    const kyuuBodyResults = await runPostBenchmarkForUrl("Kyuu JSON Body (No Val)", kyuuUrl, body);

    const kyuuZodUrl = `http://127.0.0.1:${kyuuAddress.port}/validated-json`;
    const kyuuZodResults = await runPostBenchmarkForUrl(
      "Kyuu JSON Body (Zod Val)",
      kyuuZodUrl,
      body,
    );

    console.table([
      {
        Benchmark: kyuuBodyResults.name,
        "Req/Sec": Math.round(kyuuBodyResults.requestsPerSec),
        "Avg Latency (ms)": kyuuBodyResults.avgLatencyMs.toFixed(3),
        "p50 (ms)": kyuuBodyResults.p50Ms.toFixed(3),
        "p95 (ms)": kyuuBodyResults.p95Ms.toFixed(3),
        "p99 (ms)": kyuuBodyResults.p99Ms.toFixed(3),
        Errors: kyuuBodyResults.errorCount,
      },
      {
        Benchmark: kyuuZodResults.name,
        "Req/Sec": Math.round(kyuuZodResults.requestsPerSec),
        "Avg Latency (ms)": kyuuZodResults.avgLatencyMs.toFixed(3),
        "p50 (ms)": kyuuZodResults.p50Ms.toFixed(3),
        "p95 (ms)": kyuuZodResults.p95Ms.toFixed(3),
        "p99 (ms)": kyuuZodResults.p99Ms.toFixed(3),
        Errors: kyuuZodResults.errorCount,
      },
    ]);
  } finally {
    await kyuuApp.close();
    await new Promise<void>((resolve) => expressServer.close(() => resolve()));
  }
}

async function main() {
  // 1. HTTP Server Baseline Benchmark (Kyuu vs Express GET & POST JSON Body)
  await runHttpBenchmark();
  // 2. Body Parser / Multipart Benchmark
  await runBodyParserBenchmark();
  // 3. Isolated Router Benchmark (Static & Dynamic Radix Trie)
  await runRouterBenchmark();
  // 4. Middleware Benchmark (Median of 3 runs)
  await runMiddlewareBenchmark();
}

void main();
