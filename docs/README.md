# Forge Documentation

Welcome to the documentation for **Forge** — an experimental, TypeScript-first Node.js backend framework designed to provide the simplicity and developer experience of Express.js alongside structured application architecture and performance.

> **Current Status:** Phases 0–2 Implemented (Core HTTP Runtime & Router)  
> **Codename:** Forge (Temporary project codename)

---

## Documentation Sitemap

- [**Getting Started**](./getting-started.md)  
  Environment prerequisites, installation, repository scripts (`pnpm check`), and a Quickstart Hello World example.

- [**Core Concepts**](./core-concepts.md)  
  Learn about the `createApp()` application factory, lifecycle states, `Request` and `Response` abstractions, and error handling.

- [**Routing System**](./routing.md)  
  Detailed guide on HTTP method routing, route parameter extraction (`:id`), wildcards (`*`), and precedence scoring.

- [**Benchmarking**](./benchmarking.md)  
  Overview of the `@forge/benchmark` package, running benchmark tests, and tracking performance baselines against Express.

- [**Roadmap Overview**](./roadmap-overview.md)  
  Summary of completed development phases (Phases 0–2) and upcoming planned phases (Phases 3–21) based on [`SPEC.md`](../SPEC.md) and [`ROADMAP.md`](../ROADMAP.md).

---

## Core Principles

1. **Express Familiarity:** Clean, intuitive developer experience (`app.get`, `app.post`, `app.listen`).
2. **TypeScript-First:** Built in TypeScript with strong type safety while maintaining full JavaScript runtime compatibility.
3. **Measured Performance:** Minimum target performance comparable to Express.js under equivalent workloads without unnecessary hot-path overhead.
4. **Modular Architecture:** Core runtime kept lightweight, with infrastructure capabilities structured cleanly into monorepo packages.
