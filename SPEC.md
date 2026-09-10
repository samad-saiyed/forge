# Forge — Project Specification

**Status:** Experimental / In Development  
**Codename:** Forge  
**Project Type:** Node.js Backend Framework  
**Primary Language:** TypeScript  
**Runtime:** Node.js

---

## 1. Project Summary

Forge is an experimental Node.js backend framework designed to provide the **simplicity and familiarity of Express.js** while introducing a more opinionated, structured, and scalable application architecture inspired by the developer experience of frameworks such as Next.js and NestJS.

The primary goal is **not to outperform Fastify**.

The primary performance requirement is that Forge should not be meaningfully worse than Express under comparable workloads, while providing significantly more built-in structure and developer tooling.

Forge aims to make it easy to start a small API while also providing conventions that remain useful as an application grows into a large production backend.

The framework will combine:

```text
Express-like API
        +
Opinionated filesystem architecture
        +
TypeScript-first development
        +
CLI tooling
        +
Configuration system
        +
Production integrations
        +
Integrated benchmarking
        +
Future scalability
```

The project will be developed incrementally, with performance, developer experience, maintainability, and extensibility considered throughout development.

---

# 2. Core Vision

Forge should answer a common problem with Node.js backend development:

> Express provides an excellent minimal HTTP foundation, but it leaves many architectural decisions entirely to the application developer.

As applications become larger, teams repeatedly need to decide:

- Where routes should live
- Where controllers should live
- Where business logic should live
- Where database code should live
- Where background jobs should live
- How configuration should work
- How logging should work
- How infrastructure should be initialized
- How projects should be generated
- How applications should be deployed
- How applications should scale

Forge should provide sensible conventions for these concerns without forcing developers into an unnecessarily complex programming model.

The desired experience is:

> **Express simplicity with an opinionated architecture for serious applications.**

---

# 3. Primary Goals

## 3.1 Express-Like Developer Experience

A developer familiar with Express should immediately understand basic Forge code.

The framework should support an API conceptually similar to:

```ts
const app = createApp();

app.use(middleware);

app.get("/users/:id", async (req, res) => {
  const user = await getUser(req.params.id);

  return res.json(user);
});

app.post("/users", async (req, res) => {
  const user = await createUser(req.body);

  return res.status(201).json(user);
});

app.listen(3000);
```

Forge should not introduce unnecessary abstractions simply for the sake of being different.

---

## 3.2 Opinionated Application Architecture

Forge should provide a predictable application structure.

Developers should not need to invent their own project architecture for every project.

A Forge application should eventually resemble:

```text
src/
├── app/
├── config/
├── database/
├── middleware/
├── jobs/
└── lib/

forge.config.ts
```

Larger applications may use additional conventions such as:

```text
controllers/
services/
repositories/
schemas/
types/
```

The exact architecture will evolve during development.

The framework should favor **clear conventions over unlimited structural freedom**.

---

## 3.3 Filesystem-Based Conventions

Forge should provide a Next.js-inspired filesystem convention for backend applications.

Correct folder and file names should have semantic meaning.

For example, a future routing convention could resemble:

```text
src/app/
├── users/
│   └── route.ts
│
└── users/
    └── [id]/
        └── route.ts
```

which could represent:

```text
/users
/users/:id
```

The exact filesystem routing specification will be determined during implementation.

The important principle is:

> **The filesystem should communicate application architecture and, where appropriate, application behavior.**

---

## 3.4 TypeScript First

Forge will be designed with TypeScript as the recommended development experience.

TypeScript should provide:

- Typed request objects
- Typed response objects
- Typed route parameters
- Typed query parameters
- Typed request bodies
- Typed middleware
- Typed configuration
- Type-safe framework APIs
- Strong editor autocomplete

JavaScript must remain supported.

Forge should not require TypeScript at runtime.

---

# 4. Performance Requirements

Performance is an explicit project concern.

## 4.1 Primary Requirement

Forge should **not be meaningfully slower than Express** under comparable workloads.

Fastify-level performance is not a hard requirement.

The project is not primarily intended to become a benchmark-winning HTTP framework.

Instead:

> Forge should provide substantially more developer experience and architecture while retaining good Node.js HTTP performance.

---

## 4.2 Performance Philosophy

Performance decisions should be based on measurements rather than assumptions.

Important performance areas include:

- Routing
- Middleware execution
- Request parsing
- Response handling
- JSON serialization
- Object allocations
- Garbage collection
- Async execution
- Configuration overhead
- Filesystem route discovery
- Logging

The framework should avoid unnecessary overhead in the HTTP request hot path.

---

## 4.3 Benchmarking

Forge will have a dedicated benchmarking package.

Potential package:

```text
@forge/benchmark
```

Benchmarking should eventually compare:

```text
Forge
Express
Fastify
```

where appropriate.

Metrics should include:

- Requests/sec
- Latency
- p50
- p90
- p95
- p99
- Error rate
- Memory usage
- CPU usage

Performance regressions should be detectable during development and potentially CI.

---

# 5. Core HTTP Framework

The initial Forge runtime should remain relatively small.

The core should provide:

```text
Application
Router
Middleware
Request
Response
Error handling
HTTP server
Configuration
```

The underlying HTTP implementation should use Node.js's native HTTP capabilities unless future experimentation demonstrates a compelling reason to change.

---

# 6. Routing

Forge should support familiar Express-style routing.

Expected capabilities include:

```ts
app.get();
app.post();
app.put();
app.patch();
app.delete();
app.options();
app.head();
```

Routing should eventually support:

```text
Static routes
Dynamic parameters
Wildcards
Nested routes
Route precedence
```

Example:

```ts
app.get("/users/:id", handler);
```

should expose:

```ts
req.params.id;
```

with appropriate TypeScript support.

---

# 7. Middleware

Forge should provide an Express-like middleware model.

Conceptually:

```ts
app.use((req, res, next) => {
  // middleware

  next();
});
```

The middleware system should support:

- Global middleware
- Route middleware
- Path-specific middleware
- Async middleware
- Error middleware
- Middleware ordering
- Early response termination

Middleware performance should be benchmarked because middleware execution occurs on the request hot path.

---

# 8. Request API

Forge should provide a familiar request abstraction.

Expected capabilities include:

```ts
req.method;
req.url;
req.headers;
req.params;
req.query;
req.body;
```

Additional request functionality may be added later.

Where practical, expensive parsing operations should be lazy or otherwise optimized.

---

# 9. Response API

Forge should provide an Express-like response API.

Expected capabilities include:

```ts
res.status();
res.send();
res.json();
res.end();
res.set();
res.header();
```

The framework should correctly handle:

- HTTP status codes
- Headers
- Content types
- JSON serialization
- Strings
- Buffers
- Response termination
- Duplicate response attempts

---

# 10. Error Handling

Forge should provide predictable application error handling.

It should support:

- Synchronous handler errors
- Asynchronous handler errors
- Middleware errors
- Centralized error handling
- 404 handling
- Development error information
- Production-safe error responses

The framework should avoid leaking sensitive internal information in production.

---

# 11. Configuration

Forge should provide a central configuration file.

The intended concept is similar to:

```text
forge.config.ts
```

Example:

```ts
import { defineConfig } from "forge";

export default defineConfig({
  logging: true,

  benchmarking: false,

  server: {
    port: 3000,
  },
});
```

The configuration system should eventually provide configuration for areas such as:

```text
Server
Logging
Benchmarking
Database
Redis
Background jobs
Docker
Scaling
Workers
Performance
```

Not every configuration option needs to exist initially.

The configuration system should be designed so these future capabilities can be introduced without requiring a breaking redesign.

---

# 12. CLI

Forge should eventually have a CLI inspired by the developer experience of NestJS and similar frameworks.

Potential commands:

```bash
forge new my-api
forge dev
forge build
forge start
forge generate
forge routes
forge benchmark
forge doctor
```

The CLI should automate repetitive work rather than hide important framework behavior.

---

# 13. Code Generation

Forge should eventually generate common application structures.

Examples:

```bash
forge generate resource users
```

could generate something like:

```text
users/
├── route.ts
├── controller.ts
├── service.ts
├── schema.ts
└── types.ts
```

Potential generators include:

```text
Routes
Resources
Controllers
Services
Middleware
Schemas
Jobs
Repositories
```

Generated structures should follow Forge's current conventions automatically.

---

# 14. Filesystem + Manual APIs

Filesystem conventions should not completely replace the traditional programmatic API.

Forge should support both:

### Convention-based

```text
src/app/users/route.ts
```

and:

### Explicit routing

```ts
app.get("/health", healthHandler);
```

This allows developers to use Forge's conventions where they are useful while retaining flexibility for special cases.

---

# 15. Database Integration

Database support should be easy to configure but should not unnecessarily become part of the HTTP runtime core.

Forge should provide conventions and integrations around databases.

Potential structure:

```text
src/database/
├── client.ts
├── config.ts
└── migrations/
```

Potential future integrations include:

```text
PostgreSQL
MySQL
MongoDB
```

The exact database libraries should be evaluated when this phase is implemented.

Forge should focus on:

- Configuration
- Lifecycle
- Initialization
- Shutdown
- Environment variables
- Developer experience

rather than reinventing database drivers or ORMs.

---

# 16. Redis Integration

Redis should eventually be available as a first-class Forge integration.

Potential package:

```text
@forge/redis
```

Potential responsibilities:

- Connection management
- Configuration
- Lifecycle
- Error handling
- Graceful shutdown
- Framework integration

Example concept:

```ts
redis({
  url: process.env.REDIS_URL,
});
```

---

# 17. Background Jobs

Forge should provide an opinionated way to organize background jobs.

Potential structure:

```text
src/jobs/
└── email/
    ├── job.ts
    └── processor.ts
```

Potential API:

```ts
defineJob({
  name: "send-email",

  async process(data) {
    // ...
  },
});
```

Forge should prefer integrating mature queue technologies rather than reinventing a production queue implementation.

Potential technologies will be evaluated later.

---

# 18. Logging

Logging should be easy to enable and configure.

Potential configuration:

```ts
logging: {
    enabled: true,
    level: "info"
}
```

The logging system should support:

```text
Info
Warn
Error
Debug
```

and structured metadata.

Request logging should eventually capture information such as:

```text
Method
URL
Status
Duration
Request ID
```

Logging should be designed with performance in mind.

---

# 19. Docker and Deployment

Forge should be Docker-friendly from the beginning, even though sophisticated Docker tooling will be implemented later.

The framework should eventually be able to generate or assist with:

```text
Dockerfile
.dockerignore
docker-compose.yml
```

Potential CLI functionality:

```bash
forge docker
```

or:

```bash
forge add postgres
forge add redis
```

The goal is to make common development and deployment infrastructure straightforward without hiding Docker itself.

---

# 20. Scaling and Multi-Core Architecture

Scaling is a long-term Forge feature.

The configuration system should eventually support something conceptually similar to:

```ts
scaling: {
  mode: "single";
}
```

Future modes may include:

```text
single
cluster
workers
```

Potential architecture:

```text
                 Forge
                   │
              Master Process
                   │
        ┌──────────┼──────────┐
        ↓          ↓          ↓
     Worker 1   Worker 2   Worker 3
```

Future capabilities may include:

- CPU detection
- Automatic worker count
- Manual instance count
- Worker lifecycle management
- Worker crash handling
- Worker restart
- Graceful shutdown
- Deployment guidance

This should be implemented only after the core runtime is stable.

---

# 21. Production Readiness

Forge should eventually provide sensible production behavior.

Important areas include:

### Graceful Shutdown

Handle:

```text
SIGTERM
SIGINT
```

and coordinate:

```text
HTTP server
Database
Redis
Background jobs
Workers
```

### Resource Protection

Potential protections:

```text
Request timeout
Body size limit
Header limits
Connection handling
```

### Security

Evaluate appropriate defaults and integrations for:

```text
Secure headers
Input validation
Error information leakage
Path traversal
Prototype pollution
Request limits
```

Security decisions should be based on the actual framework architecture and current ecosystem best practices.

---

# 22. Developer Experience

Developer experience is one of Forge's primary goals.

The framework should provide useful feedback during development.

Example:

```text
Forge

✓ Server started
✓ Configuration loaded
✓ Routes loaded

Local: http://localhost:3000

Routes:

GET    /users
POST   /users
GET    /users/:id
DELETE /users/:id
```

Errors should be actionable.

A good Forge error should communicate:

```text
What happened
Where it happened
Why it happened
How to fix it
```

---

# 23. Route Inspection

Forge should eventually provide a route inspection command:

```bash
forge routes
```

Example:

```text
METHOD   PATH
GET      /users
POST     /users
GET      /users/:id
DELETE   /users/:id
```

This should be particularly useful for filesystem-generated routes.

---

# 24. Project Diagnostics

Forge should eventually provide:

```bash
forge doctor
```

Potential checks:

```text
Node.js version
Configuration
Project structure
Missing dependencies
Invalid routes
Environment configuration
Database configuration
Redis configuration
```

The command should help developers identify common setup problems quickly.

---

# 25. Package Architecture

Forge should be modular.

The core runtime should not contain every feature.

Potential package ecosystem:

```text
@forge/core
@forge/cli
@forge/benchmark
@forge/redis
@forge/postgres
@forge/jobs
```

Additional packages may be created as the project evolves.

The general principle is:

> **Keep the core small; make integrations modular.**

Database, Redis, queues, benchmarking, and similar functionality should not unnecessarily increase the dependency footprint of applications that do not use them.

---

# 26. Plugin System

A future plugin system may allow third-party or internal extensions.

Potential concept:

```ts
app.usePlugin(plugin);
```

or:

```ts
definePlugin({
  name: "redis",

  setup(app) {
    // ...
  },
});
```

The plugin system should not be implemented prematurely.

It should emerge after the framework's core extension points become clear.

---

# 27. Testing Requirements

Every major Forge feature should have automated tests.

Testing should include:

### Unit Tests

For:

```text
Router
Middleware
Request
Response
Configuration
CLI
Utilities
```

### Integration Tests

For:

```text
HTTP lifecycle
Filesystem routing
Database
Redis
Jobs
Docker
```

### Type Tests

For:

```text
Route parameters
Query parameters
Request bodies
Responses
Middleware
Configuration
```

### Stress Tests

For:

```text
High concurrency
Large payloads
Many routes
Long-running requests
Large middleware chains
```

---

# 28. Benchmarking Requirements

Benchmarking is not optional for performance-sensitive Forge components.

Major runtime changes should be evaluated against an established baseline.

At minimum, benchmark:

```text
Routing
Middleware
Request parsing
Response handling
JSON serialization
Parameters
Query parsing
Error handling
Complete HTTP lifecycle
```

Benchmarks should be reproducible.

Benchmark results should not be presented as meaningful unless the testing conditions are comparable.

---

# 29. Real-World Validation

Forge should not be considered mature solely because its unit tests pass.

The framework should eventually be used to build real applications.

At least three levels should be tested:

### Small Application

Simple CRUD/API application.

Purpose:

> Validate basic developer experience.

### Medium Application

Include:

```text
Authentication
Database
Redis
Background jobs
Logging
Docker
```

Purpose:

> Validate architecture and integrations.

### Large Application

Use Forge conventions extensively.

Include:

```text
Filesystem routing
Controllers
Services
Schemas
Repositories
Database
Redis
Jobs
Logging
Docker
Testing
```

Purpose:

> Determine whether Forge's architecture remains useful as application complexity increases.

---

# 30. What Forge Is Not

Forge is not intended to be:

- A Fastify clone
- An Express fork
- A complete replacement for every Node.js infrastructure library
- A database ORM
- A Redis implementation
- A queue implementation
- A Docker replacement
- A Kubernetes replacement
- A framework that hides Node.js completely
- A framework that requires every application to use every feature

Forge should integrate with existing technologies where appropriate.

---

# 31. Core Design Philosophy

Forge should follow these principles throughout development.

### Familiarity

An Express developer should be able to understand basic Forge code immediately.

### Convention

Common architectural decisions should be made once by the framework rather than repeatedly by every project.

### Explicitness

Conventions should be understandable and discoverable.

### Modularity

Optional functionality should remain optional.

### Performance

The framework should avoid unnecessary runtime overhead.

### Type Safety

TypeScript should provide a first-class development experience.

### Production Readiness

Production concerns should influence architecture even when implementation comes later.

### Developer Experience

Common tasks should be easy without preventing advanced users from taking control.

### Measurement

Performance and architectural decisions should be validated through actual testing.

---

# 32. Non-Goals for Early Development

The early versions of Forge should **not** attempt to implement everything described in this document.

In particular, the initial development should focus on:

```text
HTTP server
Router
Middleware
Request
Response
Error handling
TypeScript
Testing
Benchmarking
```

Only after these foundations are stable should Forge move toward:

```text
Filesystem routing
Configuration
CLI
Validation
Logging
Database
Redis
Jobs
Docker
Scaling
```

The existence of a feature in this specification does not imply that it should be implemented immediately.

---

# 33. Initial Technical Direction

The initial implementation should favor:

```text
Node.js
TypeScript
node:http
Minimal dependencies
Modular packages
Automated tests
Benchmark-driven optimization
```

The framework should avoid prematurely introducing complicated infrastructure.

Complexity should be justified by a concrete requirement.

---

# 34. Success Criteria

Forge will be successful if a developer can create a backend application and experience the following progression:

### Initial Project

```bash
forge new my-api
```

### Development

```bash
forge dev
```

### Familiar API

```ts
app.get("/users/:id", async (req, res) => {
  const user = await users.find(req.params.id);

  return res.json(user);
});
```

### Structured Application

```text
src/
├── app/
├── database/
├── middleware/
├── jobs/
└── lib/
```

### Production Infrastructure

```text
Database
Redis
Jobs
Logging
Docker
```

### Performance

```text
Forge ≈ Express
```

without requiring developers to manually design every architectural convention themselves.

---

# 35. Long-Term Vision

The long-term vision for Forge is to become a complete development platform for Node.js backend applications.

A mature Forge project should provide:

```text
                    Forge
                      │
       ┌──────────────┼──────────────┐
       │              │              │
    Runtime          CLI          Architecture
       │              │              │
    Router        Generators     Filesystem
    HTTP          Dev server     Conventions
    Middleware    Build          Type safety
       │
       ├───────────────┬───────────────┐
       │               │               │
    Database         Redis            Jobs
       │               │               │
       └───────────────┼───────────────┘
                       │
                  Production
                       │
            ┌──────────┼──────────┐
            │          │          │
          Docker    Logging    Scaling
```

The framework should make the **common path extremely easy**, while still allowing experienced developers to drop down to lower-level Node.js APIs when necessary.

---

# 36. Current Project Status

**Forge is currently in the planning stage.**

No implementation has been committed yet.

The immediate next objective is:

> **Complete Phase 0 — Project Foundation.**

The first meaningful milestone after that is:

> **A minimal Forge application capable of serving HTTP requests with an Express-like API.**

The project should grow from that small core rather than attempting to implement the entire vision simultaneously.

---

# 37. Relationship to the Master Roadmap

This specification defines:

- What Forge is
- Why Forge exists
- What Forge should eventually provide
- What principles guide development
- What the framework should and should not attempt to be
- The intended technical direction

The **Master Roadmap** defines:

- What needs to be implemented
- The order of implementation
- Individual development tasks
- Testing tasks
- Benchmarking tasks
- Production-readiness tasks
- Release tasks

Both documents should evolve as the project evolves.

The specification describes the **destination and constraints**.

The roadmap describes the **path**.
