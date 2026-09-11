# Getting Started with Forge

This guide explains how to set up, build, test, and run Forge locally.

---

## Prerequisites

- **Node.js**: `>= 22.0.0`
- **Package Manager**: `pnpm` (version `9.10.0` or compatible)

---

## Local Setup

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/samad-saiyed/forge.git
   cd forge
   ```

2. **Install Dependencies:**

   ```bash
   pnpm install
   ```

3. **Build the Monorepo:**

   ```bash
   pnpm build
   ```

---

## Development Workflow & Verification

Forge provides standard quality scripts to verify the codebase:

```bash
# Run all quality checks (linting, formatting check, tests, typecheck)
pnpm check

# Run unit and integration tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run ESLint linter
pnpm lint

# Check formatting with Prettier
pnpm format:check

# Format code with Prettier
pnpm format

# Run TypeScript compiler check across packages
pnpm typecheck
```

---

## Quickstart Example

Create a basic HTTP application with Forge:

```typescript
import { createApp } from "@forge/core";

const app = createApp();

// Register HTTP GET route
app.get("/hello", (req, res) => {
  return res.json({ message: "Hello, World!" });
});

// Register dynamic route with route parameters
app.get("/users/:id", (req, res) => {
  return res.json({ userId: req.params.id });
});

// Start listening on port 3000
app.listen(3000);
console.log("Server listening on http://localhost:3000");
```

---

## Workspace Structure

The project is structured as a monorepo:

```text
forge/
├── packages/
│   ├── core/         # Framework core (@forge/core)
│   ├── cli/          # Command-line interface (@forge/cli)
│   └── benchmark/    # Performance benchmarks (@forge/benchmark)
├── docs/             # Framework documentation
├── tests/            # Unit, integration, and type tests
└── examples/         # Usage examples
```
