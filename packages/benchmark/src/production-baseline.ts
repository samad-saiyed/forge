import {
  BuildOrchestrator,
  compileTypeScriptProject,
  discoverBuildRouteEntries,
  generateBuildManifest,
  loadProductionBuildConfig,
  startProductionServer,
} from "@forge/core";
import express from "express";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { runBenchmarkForUrl, type BenchmarkResult } from "./index.js";

function getDirSize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(fullPath);
    } else if (entry.isFile()) {
      total += statSync(fullPath).size;
    }
  }
  return total;
}

export async function runProductionBaseline(): Promise<void> {
  console.log("=========================================================================");
  console.log("  ACTION 70.11 — PRODUCTION BUILD & RUNTIME PERFORMANCE BASELINE");
  console.log("=========================================================================\n");

  const tempDir = join(
    tmpdir(),
    `forge-perf-baseline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tempDir, { recursive: true });

  try {
    // -------------------------------------------------------------------------
    // 1. BUILD PIPELINE BENCHMARK
    // -------------------------------------------------------------------------
    console.log("1. Measuring Production Build Pipeline Performance...\n");

    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "perf-baseline-app", type: "module" }),
    );
    writeFileSync(join(tempDir, "forge.config.js"), "export default { server: { port: 5990 } };");

    mkdirSync(join(tempDir, "src", "app", "users", "[id]"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "users", "route.ts"),
      'export const GET = (_req: any, res: any) => { res.json({ route: "users" }); };',
    );
    writeFileSync(
      join(tempDir, "src", "app", "users", "[id]", "route.ts"),
      "export const GET = (req: any, res: any) => { res.json({ id: req.params.id }); };",
    );

    // Individual stage timings
    const stagingDir = join(tempDir, ".forge", "build-staging");
    mkdirSync(stagingDir, { recursive: true });

    const buildConfig = await loadProductionBuildConfig(tempDir);

    const tsStart = performance.now();
    compileTypeScriptProject({ projectRoot: tempDir, stagingDir });
    const tsTime = performance.now() - tsStart;

    const routesStart = performance.now();
    const routes = await discoverBuildRouteEntries({
      projectRoot: tempDir,
      stagingDir,
      language: buildConfig.language,
    });
    const routesTime = performance.now() - routesStart;

    const manifestStart = performance.now();
    await generateBuildManifest({
      projectRoot: tempDir,
      stagingDir,
      language: buildConfig.language,
      configPathRelative: buildConfig.configPathRelative,
      routes,
    });
    const manifestTime = performance.now() - manifestStart;

    // Full Build Orchestration
    const orchestrator = new BuildOrchestrator({ projectRoot: tempDir });
    const fullBuildStart = performance.now();
    const buildResult = await orchestrator.build();
    const fullBuildTime = performance.now() - fullBuildStart;

    const artifactSizeBytes = getDirSize(buildResult.buildDir);

    console.table([
      {
        Stage: "TypeScript Compilation",
        "Duration (ms)": tsTime.toFixed(2),
      },
      {
        Stage: "Route Discovery",
        "Duration (ms)": routesTime.toFixed(2),
      },
      {
        Stage: "Manifest Generation",
        "Duration (ms)": manifestTime.toFixed(2),
      },
      {
        Stage: "Total Build Orchestration (forge build)",
        "Duration (ms)": fullBuildTime.toFixed(2),
      },
      {
        Stage: "Final Artifact Size (.forge/build)",
        "Duration (ms)": `${(artifactSizeBytes / 1024).toFixed(2)} KB`,
      },
    ]);

    // -------------------------------------------------------------------------
    // 2. RUNTIME BENCHMARK (PRODUCTION vs DEV vs EXPRESS)
    // -------------------------------------------------------------------------
    console.log(
      "\n2. Measuring Runtime Throughput & Latency (5,000 requests, concurrency 20)...\n",
    );

    // A. Production Server Startup
    const runnerResult = await startProductionServer({ projectRoot: tempDir, port: 5991 });
    const prodPort = runnerResult.config.server.port;

    // B. Express Baseline Server
    const expressApp = express();
    expressApp.get("/users", (_req, res) => {
      res.json({ route: "users" });
    });
    expressApp.get("/users/:id", (req, res) => {
      res.json({ id: req.params.id });
    });
    const expressServer = expressApp.listen(0);
    await new Promise<void>((res) => expressServer.once("listening", res));
    const expressAddr = expressServer.address() as { port: number };

    try {
      // Run HTTP benchmarks
      const prodStaticRes = await runBenchmarkForUrl(
        "Production Forge (Static)",
        `http://127.0.0.1:${prodPort}/users`,
      );
      const prodDynamicRes = await runBenchmarkForUrl(
        "Production Forge (Dynamic :id)",
        `http://127.0.0.1:${prodPort}/users/42`,
      );
      const expressStaticRes = await runBenchmarkForUrl(
        "Express Baseline (Static)",
        `http://127.0.0.1:${expressAddr.port}/users`,
      );
      const expressDynamicRes = await runBenchmarkForUrl(
        "Express Baseline (Dynamic :id)",
        `http://127.0.0.1:${expressAddr.port}/users/42`,
      );

      const results: BenchmarkResult[] = [
        prodStaticRes,
        prodDynamicRes,
        expressStaticRes,
        expressDynamicRes,
      ];

      console.table(
        results.map((r) => ({
          Workload: r.name,
          "Req/Sec": Math.round(r.requestsPerSec),
          "Avg Latency (ms)": r.avgLatencyMs.toFixed(3),
          "p50 (ms)": r.p50Ms.toFixed(3),
          "p95 (ms)": r.p95Ms.toFixed(3),
          "p99 (ms)": r.p99Ms.toFixed(3),
          Errors: r.errorCount,
        })),
      );
    } finally {
      await runnerResult.app.close();
      await new Promise<void>((res) => expressServer.close(() => res()));
    }
  } finally {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  console.log("\nBaseline measurement complete.\n");
}

if (process.argv[1] && process.argv[1].endsWith("production-baseline.js")) {
  void runProductionBaseline();
}
