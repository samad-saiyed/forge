# Contributing to Forge

Thank you for your interest in contributing to Forge.

Forge is an experimental, TypeScript-first backend framework designed to bring the familiarity and ergonomics of Express.js together with a structured, opinionated application architecture.

---

## Project Status

**Experimental / Active Internal Development**

Forge is currently in its early development phases. Core APIs, architectural patterns, and package layouts are actively evolving. As such, development is currently focused and iterative. We are prioritizing disciplined foundational engineering over broad feature expansion.

---

## Development Philosophy

When contributing to Forge, keep our core principles in mind:

1. **Express-like Familiarity:** The developer experience should feel intuitive to anyone with an Express.js background.
2. **Incremental Execution:** Build one foundation at a time according to the phase roadmap. Do not implement features planned for future phases prematurely.
3. **TypeScript-First:** Strong typing, sensible inference, and great editor ergonomics are first-class citizens.
4. **Lean & Modular Core:** Keep the core runtime minimal. Avoid unnecessary dependencies or bloated abstractions.
5. **Explicit Over Magical:** Framework behavior should be discoverable, predictable, and transparent.

---

## Architectural Alignment

All work and architectural proposals **must stay strictly aligned with:**

- [SPEC.md](file:///d:/Forge/SPEC.md) — Technical specification and design constraints.
- [ROADMAP.md](file:///d:/Forge/ROADMAP.md) — Phased master development plan.

Before proposing significant changes, consult both documents to ensure the work fits into the current phase and adheres to established design decisions.

---

## Repository Setup

### Prerequisites

- **Node.js**: Modern LTS (Node.js 20+ recommended)
- **Package Manager**: npm (or pnpm / yarn depending on repository lockfiles)
- **Git**

### Setup Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/samad-saiyed/forge.git
   cd forge
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

---

## Basic Development Commands

Common scripts used during development:

```bash
# Build the project / packages
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linter and type checks
npm run lint
npm run typecheck
```

_(Note: Specific commands may evolve as packages and tooling are added during Phase 1.)_

---

## Code Expectations

- **Language**: All core codebase implementations must be in TypeScript.
- **Simplicity**: Write clear, readable, and self-documenting code. Prefer simple, direct solutions over clever or convoluted abstractions.
- **Error Handling**: Handle edge cases explicitly and ensure errors yield clear, actionable messages.
- **Dependencies**: Minimize external runtime dependencies. Leverage Node.js built-ins (`node:http`, `node:path`, etc.) whenever viable.

---

## Testing Expectations

- Every new feature, bug fix, or runtime behavior must include accompanying tests.
- Ensure tests cover both the happy path and critical edge cases (e.g., malformed inputs, abnormal connection terminations, boundary values).
- Keep tests deterministic, fast, and isolated.

---

## Performance Expectations

Performance is a foundational requirement for Forge:

- The primary performance target is: **Forge ≈ Express.js**.
- Changes to core HTTP execution, routing, or middleware dispatching must not introduce performance regressions.
- Performance-sensitive changes should be backed by benchmarks rather than assumptions.

---

## Commit & Pull Request Guidance

We keep the contribution workflow straightforward:

- **Focused Scope**: Keep changes focused on a single objective, task, or bug fix.
- **Descriptive Commit Messages**: Use clear, conventional commit messages that explain _what_ changed and _why_ (e.g., `feat(core): implement basic request wrapper`, `test(router): add route parameter parsing tests`).
- **Pull Requests**:
  - Reference any related issues, roadmap items, or spec sections.
  - Provide a concise summary of the changes.
  - Ensure all tests, type checks, and linter checks pass before requesting review.
