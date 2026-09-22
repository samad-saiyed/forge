# Kyuu

Kyuu is an experimental, TypeScript-first Node.js backend framework designed to provide the simplicity and familiarity of Express.js with a more structured and opinionated application architecture.

The goal is simple:

> **Express-like developer experience with a framework architecture suitable for serious applications.**

Kyuu is being built from the ground up with performance as a first-class requirement. The framework should perform **at least comparably to Express.js** under comparable workloads, while remaining significantly more structured and extensible.

---

## Status

**Experimental / In Development**

Kyuu is currently under active development. APIs, architecture, package structure, and conventions may change significantly before the first stable release.

---

## Vision

Node.js makes it easy to build HTTP servers, but larger applications often require developers to repeatedly make the same architectural decisions.

Kyuu aims to provide sensible conventions for:

- HTTP applications
- Routing
- Middleware
- TypeScript
- Application structure
- Configuration
- CLI tooling
- Validation
- Logging
- Database integrations
- Redis
- Background jobs
- Docker
- Performance benchmarking
- Production deployment

The framework should make the common path simple without preventing developers from accessing lower-level Node.js capabilities when necessary.

---

## Design Principles

### Familiar

Kyuu's API should closely resemble Express.js wherever possible.

An Express developer should be able to understand basic Kyuu code immediately.

### Opinionated

Kyuu should provide conventions for common application architecture instead of forcing every project to invent its own structure.

### Performant

Performance is a core requirement.

Kyuu should not be meaningfully slower than Express under comparable workloads. Performance-sensitive decisions should be validated through benchmarks rather than assumptions.

### TypeScript First

TypeScript is the primary development experience.

The framework should provide strong typing and editor support while continuing to support JavaScript applications.

### Modular

The core runtime should remain small.

Optional functionality such as databases, Redis, background jobs, and benchmarking should be separated where appropriate instead of unnecessarily increasing the core dependency footprint.

### Explicit

Conventions should be predictable, understandable, and discoverable.

Kyuu should simplify application development without hiding important framework behavior.

---

## Development Philosophy

Kyuu is being developed incrementally.

The initial implementation will focus on establishing a small, reliable HTTP runtime before adding higher-level framework functionality.

The development path begins with:

```text
Project Foundation
        ↓
Core HTTP Runtime
        ↓
Router
        ↓
Middleware
        ↓
Type Safety
        ↓
Configuration
        ↓
Filesystem Architecture
        ↓
CLI
        ↓
Integrations
        ↓
Production Features
```

Features planned for later stages will not be implemented prematurely.

---

## Initial Technical Direction

Kyuu currently targets:

- **Runtime:** Node.js
- **Language:** TypeScript
- **HTTP:** Node.js native `node:http`
- **Architecture:** Modular monorepo
- **Testing:** Automated unit and integration testing
- **Performance:** Benchmark-driven development

The technical implementation may evolve as the project develops and measurements provide better information.

---

## Project Structure

The repository is intended to evolve toward a structure similar to:

```text
kyuu/
├── packages/
│   ├── core/
│   ├── cli/
│   └── benchmark/
│
├── examples/
├── docs/
├── tests/
│
├── package.json
├── tsconfig.json
└── README.md
```

The exact structure will be established during development.

---

## Core API Direction

Kyuu will maintain an Express-like programming model.

For example:

```ts
const app = createApp();

app.get("/users/:id", async (req, res) => {
  const user = await getUser(req.params.id);

  return res.json(user);
});

app.listen(3000);
```

The API may introduce carefully considered improvements where they make the framework cleaner or safer, but familiarity with Express remains an important constraint.

---

## Performance Target

Performance is one of Kyuu's most important project constraints.

The primary target is:

```text
Kyuu ≈ Express
```

Fastify may be used as a higher-performance reference point, but matching Fastify is **not** the primary objective.

Benchmarking will eventually compare:

```text
Kyuu
Express
Fastify
```

using controlled and reproducible workloads.

Important measurements will include:

- Requests per second
- Latency
- p50
- p90
- p95
- p99
- Error rate
- Memory usage
- CPU usage

---

## Roadmap

Kyuu is being developed according to a dedicated master development roadmap.

The major development phases are:

1. Project Foundation
2. Core HTTP Runtime
3. Router
4. Middleware System
5. Type Safety
6. Configuration System
7. Filesystem-Based Architecture
8. CLI
9. Validation and Schema System
10. Logging
11. Database Integration
12. Redis
13. Background Jobs
14. Docker and Production Development
15. Scaling and Multi-Core Architecture
16. Production Hardening
17. Developer Experience
18. Documentation
19. Testing and Quality Expansion
20. Performance Engineering
21. Package Ecosystem
22. Plugin / Extension System
23. Release Engineering
24. Real-World Validation
25. First Stable Release

The roadmap is intentionally incremental. Not every planned feature represents an immediate implementation requirement.

---

## Repository Development

The project follows a task-by-task development process.

Each implementation step should:

1. Have a clearly defined objective.
2. Remain focused on the current phase.
3. Include appropriate tests where applicable.
4. Preserve the performance target.
5. Avoid unnecessary architectural complexity.
6. Record important implementation decisions for future documentation.

---

## How Kyuu Is Built

Throughout development, important implementation details, decisions, experiments, benchmarks, and milestones will be recorded separately.

This will eventually become a **"How Kyuu Was Built"** document describing the development of the framework from its initial repository setup through the first stable release.

---

## Contributing

Kyuu is currently experimental and under active development.

Contribution guidelines will be established as the project approaches a stage where external contributions are appropriate.

---

## License

License information will be added once the project's licensing decision has been finalized.

---

**Kyuu is currently experimental.**

The framework is being built from the ground up, one foundation at a time.
