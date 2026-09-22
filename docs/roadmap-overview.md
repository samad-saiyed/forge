# Framework Roadmap & Planned Features

This document provides a high-level overview of the development roadmap for Kyuu, summarizing completed capabilities and planned future phases.

For complete specifications, see [`SPEC.md`](../SPEC.md) and [`ROADMAP.md`](../ROADMAP.md).

---

## Current Status (Completed Phases)

### Phase 0 — Project Foundation

- Monorepo package architecture (`@kyuujs/core`, `@kyuujs/cli`, `@kyuujs/benchmark`)
- ESM TypeScript compilation infrastructure
- Testing runner configuration (Vitest)
- Code quality checks (ESLint, Prettier, TypeScript strict check)

### Phase 1 — Core HTTP Runtime

- Application factory (`createApp()`) and state lifecycle machine
- Native `node:http` server integration
- Basic `Request` and `Response` abstractions
- Synchronous and asynchronous error handling
- Baseline HTTP benchmark infrastructure against Express

### Phase 2 — Router System

- Static path matching, dynamic parameter extraction (`:id`), and wildcards (`*`)
- Trailing slash and URL path normalization
- Specificity score-based route precedence algorithm

---

## Planned Future Phases

| Phase          | Feature Module              | Target Capabilities                                                                  |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| **Phase 3**    | **Middleware System**       | Global, route-level, and error middleware chains (`app.use`)                         |
| **Phase 4**    | **Type Safety**             | Inferred route parameter typing, typed request body, typed JSON responses            |
| **Phase 5**    | **Configuration System**    | Central `kyuu.config.ts` configuration loader                                       |
| **Phase 6**    | **Filesystem Architecture** | Next.js-style file-based routing (`src/app/`) alongside explicit routing             |
| **Phase 7**    | **CLI Tooling**             | Command-line scaffolding (`kyuu new`, `kyuu dev`, `kyuu build`, `kyuu generate`) |
| **Phase 8-21** | **Integrations & Scaling**  | Database ORMs, Redis, Background Jobs, Docker, Multi-worker cluster scaling          |
