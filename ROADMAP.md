# Kyuu — Master Development Roadmap

> Temporary project codename: **Kyuu**
> Goal: Build an opinionated, TypeScript-first Node.js backend framework with an Express-like developer experience, strong project conventions, production-oriented tooling, and performance at least comparable to Express.

---

## Project Principles

These principles guide the implementation throughout the project.

- Keep the API familiar to Express developers.
- TypeScript is the recommended development experience.
- JavaScript remains fully supported.
- The framework should not be slower than Express without a clear reason.
- Measure performance instead of making performance assumptions.
- Keep the runtime core small and focused.
- Infrastructure integrations should not unnecessarily inflate the core.
- Convention should reduce architectural decisions for application developers.
- File-system conventions should be powerful but not prevent manual routing.
- CLI tooling should automate repetitive project structure.
- Features should be introduced incrementally rather than designing the entire framework upfront.
- Production concerns should be considered from the beginning, even when implemented later.
- Every major feature should have automated tests.
- Performance-sensitive features should have benchmarks.

---

# Phase 0 — Project Foundation

## 0.1 Repository Initialization

- [x] Create Kyuu repository
- [x] Initialize Git
- [x] Create `.gitignore`
- [x] Create `README.md`
- [x] Create `LICENSE`
- [x] Create `CONTRIBUTING.md`
- [x] Create `CHANGELOG.md`
- [x] Create initial package metadata
- [x] Decide Node.js minimum supported version
- [x] Decide package manager
- [x] Establish project naming conventions

## 0.2 Monorepo Structure

Establish the initial package architecture.

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
├── package.json
└── tsconfig.json
```

Tasks:

- [x] Configure workspace/monorepo
- [x] Create `@kyuujs/core`
- [x] Create `@kyuujs/cli`
- [x] Create `@kyuujs/benchmark`
- [x] Configure package builds
- [x] Configure package exports
- [x] Configure internal package dependencies
- [x] Configure development scripts

## 0.3 TypeScript Infrastructure

- [x] Configure root TypeScript configuration
- [x] Configure package-level TypeScript configurations
- [x] Configure strict mode
- [x] Configure declaration generation
- [x] Configure source maps
- [x] Configure ESM/CJS strategy
- [x] Determine module resolution strategy
- [x] Test TypeScript package consumption
- [x] Test JavaScript consumption

## 0.4 Testing Infrastructure

- [x] Choose test runner
- [x] Configure unit tests
- [x] Configure integration tests
- [x] Configure test coverage
- [x] Create initial test utilities
- [x] Add CI test command
- [x] Establish test naming conventions

## 0.5 Code Quality

- [x] Configure ESLint
- [x] Configure formatter
- [x] Configure type checking
- [x] Add pre-commit checks if appropriate
- [x] Add CI linting
- [x] Add CI type checking
- [x] Add CI test execution

## 0.6 Initial Developer Workflow

Establish:

```bash
npm install
npm run build
npm run test
npm run lint
npm run typecheck
```

- [x] Verify clean clone works
- [x] Verify build works
- [x] Verify tests work
- [x] Verify packages can import one another
- [x] Create initial Hello World example

---

# Phase 1 — Core HTTP Runtime

Goal: Build the smallest useful Express-like framework.

## 1.1 Application

Implement:

```ts
const app = createApp();
```

- [x] Create application factory
- [x] Create application instance
- [x] Store application configuration
- [x] Implement application lifecycle
- [x] Implement `app.listen()`
- [x] Implement server startup
- [x] Implement server shutdown
- [x] Handle startup errors
- [x] Handle runtime errors

## 1.2 Node HTTP Integration

Use Node's native HTTP stack.

- [x] Integrate `node:http`
- [x] Handle incoming requests
- [x] Handle outgoing responses
- [x] Preserve access to native request/response where useful
- [x] Avoid unnecessary object creation
- [x] Establish HTTP abstraction boundaries

## 1.3 HTTP Method Routing

Implement:

```ts
app.get();
app.post();
app.put();
app.patch();
app.delete();
app.options();
app.head();
```

- [x] Register routes
- [x] Associate HTTP methods
- [x] Associate handlers
- [x] Match incoming requests
- [x] Execute matching handler
- [x] Handle unsupported methods
- [x] Handle 404 responses

## 1.4 Basic Request API

Implement:

```ts
req.method;
req.url;
req.headers;
req.params;
req.query;
req.body;
```

Initially:

- [x] Request wrapper design
- [x] Method access
- [x] URL access
- [x] Header access
- [x] Parameter access
- [x] Query parsing
- [ ] Body parsing
- [ ] Lazy parsing where beneficial

## 1.5 Basic Response API

Implement:

```ts
res.status();
res.send();
res.json();
res.end();
res.set();
res.header();
```

- [x] Status handling
- [x] JSON responses
- [x] String responses
- [x] Buffer responses
- [x] Headers
- [x] Content-Type handling
- [x] Response termination
- [x] Prevent duplicate response sends

## 1.6 Error Handling

- [x] Catch synchronous handler errors
- [x] Catch asynchronous handler errors
- [x] Central error handling
- [x] Default error response
- [x] 404 handling
- [x] Development error information
- [x] Production error behavior

## 1.7 Core Tests

Create comprehensive tests for:

- [x] Application startup
- [x] GET
- [x] POST
- [x] PUT
- [x] PATCH
- [x] DELETE
- [x] 404
- [x] Response status
- [x] JSON
- [x] Headers
- [x] Async handlers
- [x] Handler errors
- [x] Multiple requests

## 1.8 First Benchmark

Create the first baseline.

Compare:

```text
Kyuu
Express
```

Measure:

- [x] Requests/sec
- [x] Average latency
- [x] p50 latency
- [x] p95 latency
- [x] p99 latency
- [x] Errors
- [x] Memory usage

This becomes the first Kyuu performance baseline.

---

# Phase 2 — Router

Goal: Build a serious routing system without sacrificing the Express-like API.

## 2.1 Route Matching

- [x] Static routes
- [x] Dynamic parameters
- [x] Multiple parameters
- [x] Nested paths
- [x] Trailing slash behavior
- [x] URL decoding
- [x] Query string separation

Examples:

```text
/users
/users/:id
/users/:id/posts
/products/:productId/reviews/:reviewId
```

## 2.2 Route Parameters

Implement:

```ts
app.get("/users/:id", handler);
```

- [x] Parameter extraction
- [x] Parameter decoding
- [x] Parameter storage
- [x] `req.params`
- [ ] Parameter typing

## 2.3 Wildcards

Support patterns such as:

```text
/files/*
/assets/*
```

- [x] Wildcard matching
- [x] Wildcard extraction
- [ ] Multiple wildcard rules if supported
- [x] Define wildcard precedence

## 2.4 Route Precedence

Define predictable precedence.

Example:

```text
/users/me
/users/:id
/users/*
```

Ensure:

```text
/users/me
```

matches before:

```text
/users/:id
```

and dynamic routes match before broad wildcards.

- [x] Static route precedence
- [x] Dynamic route precedence
- [x] Wildcard route precedence

## 2.5 Router Architecture

Evaluate routing structures:

- [x] Linear route lookup
- [x] Method-based lookup
- [x] Score-based precedence optimization

Evaluate the available routing structures and select the implementation based on benchmark results.

## 2.6 Router Benchmarks

Benchmark:

- [ ] Static routes
- [ ] Dynamic routes
- [ ] Wildcards

Compare against Express.

## 2.7 Router Tests

- [x] Static routes
- [x] Parameters
- [x] Wildcards
- [x] Route conflicts
- [x] Route precedence
- [x] URL encoding
- [ ] Invalid paths

---

# Phase 3 — Middleware System

Goal: Reproduce the useful part of Express middleware while keeping the execution path efficient.

## 3.1 Middleware Registration

Implement:

```ts
app.use(middleware);
```

- [x] Global middleware
- [x] Path-specific middleware
- [x] Route middleware
- [x] Multiple middleware functions

## 3.2 Middleware Execution

Support:

```ts
(req, res, next);
```

- [x] `next()`
- [x] Async middleware
- [x] Middleware ordering
- [x] Multiple middleware
- [x] Early response termination

## 3.3 Error Middleware

Support error handlers.

- [x] Error propagation
- [x] Error middleware
- [x] Async errors
- [x] Default error handler

## 3.4 Middleware Composition

- [ ] Implement middleware composition
- [ ] Minimize allocations
- [ ] Benchmark middleware overhead
- [ ] Compare against Express
- [ ] Investigate precompiled middleware chains

## 3.5 Middleware Scopes

Define behavior for:

```text
Application middleware
Router middleware
Route middleware
Error middleware
```

## 3.6 Tests

- [x] Single middleware
- [x] Multiple middleware
- [x] Async middleware
- [x] Middleware ordering
- [x] Error middleware
- [x] Route middleware
- [x] Early responses
- [x] Middleware exceptions

---

# Phase 4 — Type Safety

Goal: Make TypeScript a first-class experience rather than an afterthought.

## 4.1 Typed Application API

- [ ] Type `createApp`
- [ ] Type HTTP methods
- [ ] Type middleware
- [ ] Type handlers
- [ ] Type request
- [ ] Type response

## 4.2 Typed Parameters

Support:

```ts
app.get("/users/:id", (req, res) => {
  req.params.id;
});
```

- [ ] Infer parameter names
- [ ] Generate parameter types
- [ ] Support explicit parameter types
- [ ] Verify autocomplete
- [ ] Verify compile-time errors

## 4.3 Typed Query

- [ ] Query type definitions
- [ ] Optional query parameters
- [ ] Typed query parsing
- [ ] Validation integration planning

## 4.4 Typed Request Body

- [ ] Generic request body
- [ ] Typed body handlers
- [ ] Schema-derived body types later

## 4.5 Typed Responses

- [ ] Response type definitions
- [ ] Typed JSON responses
- [ ] Typed status responses
- [ ] Route response contracts

## 4.6 JavaScript Compatibility

Ensure the framework works cleanly with:

```js
const app = createApp();
```

- [ ] JavaScript example project
- [ ] CommonJS compatibility if supported
- [ ] ESM compatibility
- [ ] Generated declaration files
- [ ] Runtime behavior independent of TypeScript

---

# Phase 5 — Configuration System

Goal: Establish the central framework configuration mechanism early enough that later features can depend on it.

## 5.1 Configuration File

Introduce:

```text
kyuu.config.ts
```

Potential structure:

```ts
import { defineConfig } from "kyuu";

export default defineConfig({
  logging: true,

  benchmarking: false,

  server: {
    port: 3000,
  },
});
```

## 5.2 Configuration Loader

- [ ] Locate config file
- [ ] Load TypeScript configuration
- [ ] Support JavaScript configuration
- [ ] Validate configuration
- [ ] Provide defaults
- [ ] Handle invalid configuration
- [ ] Support environment-specific values later

## 5.3 Initial Options

Only introduce options that are actually useful.

Potential initial options:

- [ ] Server configuration
- [ ] Logging configuration
- [ ] Development mode
- [ ] Benchmarking configuration
- [ ] Debugging options

## 5.4 Future-Proof Configuration

Design configuration so future options can support:

```text
Scaling
Workers
Cluster
Database
Redis
Jobs
Docker
Logging
Performance
```

without implementing those features yet.

---

# Phase 6 — File-System Based Architecture

Goal: Introduce the opinionated architecture that differentiates Kyuu from Express.

## 6.1 Convention Design

Finalize the initial filesystem convention.

Potential starting structure:

```text
src/
├── app/
├── config/
├── middleware/
├── database/
├── jobs/
└── lib/

kyuu.config.ts
```

## 6.2 File-System Routing

Explore a convention such as:

```text
src/app/
├── users/
│   └── route.ts
│
└── products/
    └── route.ts
```

And potentially:

```text
src/app/users/[id]/route.ts
```

for:

```text
/users/:id
```

Tasks:

- [ ] Define route naming conventions
- [ ] Define directory conventions
- [ ] Define dynamic route syntax
- [ ] Define HTTP method conventions
- [ ] Scan application filesystem
- [ ] Convert filesystem structure into routes
- [ ] Detect duplicate routes
- [ ] Detect invalid routes
- [ ] Generate useful errors

## 6.3 Route Module API

Define what `route.ts` exports.

Potentially:

```ts
export const GET = async (req, res) => {};
export const POST = async (req, res) => {};
```

or another API if a better approach emerges.

- [ ] Design route module API
- [ ] Implement route discovery
- [ ] Implement HTTP method discovery
- [ ] Implement route metadata
- [ ] Test hot-path performance impact

## 6.4 Conventional Architecture

Define recommended locations for:

```text
controllers/
services/
schemas/
types/
repositories/
middleware/
lib/
database/
jobs/
```

Determine which are framework conventions and which remain optional.

## 6.5 Manual + Convention Routing

Support both:

```ts
app.get("/health", handler);
```

and filesystem routing.

This should remain a core design principle.

---

# Phase 7 — CLI

Goal: Make Kyuu projects easy to create and maintain.

## 7.1 CLI Foundation

Commands:

```bash
kyuu
kyuu --help
kyuu --version
```

- [ ] CLI package
- [ ] Command parser
- [ ] Help output
- [ ] Version output
- [ ] Error handling
- [ ] Exit codes

## 7.2 Project Creation

Implement eventually:

```bash
kyuu new my-api
```

Generate:

```text
my-api/
├── src/
│   ├── app/
│   ├── config/
│   ├── middleware/
│   ├── database/
│   ├── jobs/
│   └── lib/
│
├── tests/
├── kyuu.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

Tasks:

- [ ] Project template
- [ ] TypeScript template
- [ ] JavaScript template
- [ ] Dependency installation
- [ ] Git initialization
- [ ] Environment template
- [ ] Initial example route

## 7.3 Development Commands

Implement:

```bash
kyuu dev
kyuu build
kyuu start
```

- [ ] Development server
- [ ] File watching
- [ ] Restart behavior
- [ ] Build command
- [ ] Production start command

## 7.4 Generators

Eventually:

```bash
kyuu generate route users
kyuu generate resource users
kyuu generate controller users
kyuu generate service users
kyuu generate job email
```

- [ ] Generator architecture
- [ ] Route generator
- [ ] Resource generator
- [ ] Controller generator
- [ ] Service generator
- [ ] Middleware generator
- [ ] Job generator
- [ ] Schema generator

## 7.5 CLI Diagnostics

Eventually:

```bash
kyuu doctor
```

Check:

- [ ] Node version
- [ ] Configuration
- [ ] Invalid project structure
- [ ] Missing dependencies
- [ ] Invalid routes
- [ ] Environment configuration

---

# Phase 8 — Validation and Schema System

Goal: Establish a standard approach to request validation and response contracts.

## 8.1 Validation Architecture

Determine whether Kyuu:

- provides its own validation layer,
- integrates with an existing schema library,
- or supports both.

## 8.2 Request Validation

Support validation for:

```text
Params
Query
Headers
Body
```

- [ ] Validation configuration
- [ ] Validation errors
- [ ] Error formatting
- [ ] Type inference

## 8.3 Response Validation

- [ ] Response schemas
- [ ] Development validation
- [ ] Production performance strategy
- [ ] Serialization integration

## 8.4 Schema Integration

Explore integration with libraries such as:

```text
Zod
JSON Schema
TypeBox
```

without unnecessarily forcing one library on users.

---

# Phase 9 — Logging

Goal: Make production logging easy while keeping it performant.

## 9.1 Logging Architecture

- [ ] Logger interface
- [ ] Log levels
- [ ] Structured logging
- [ ] Request logging
- [ ] Error logging
- [ ] Context metadata

## 9.2 Framework Logger

Support:

```ts
logger.info(...)
logger.warn(...)
logger.error(...)
logger.debug(...)
```

## 9.3 Request Logging

Capture:

```text
Method
URL
Status
Duration
Request ID
```

## 9.4 Performance

- [ ] Benchmark logging disabled
- [ ] Benchmark logging enabled
- [ ] Avoid expensive serialization when unnecessary
- [ ] Async logging investigation

## 9.5 Configuration

```ts
logging: {
    enabled: true,
    level: "info"
}
```

---

# Phase 10 — Database Integration

Goal: Make database setup conventional and easy without making the database part of Kyuu core.

## 10.1 Database Architecture

Establish:

```text
src/database/
├── client.ts
├── config.ts
└── migrations/
```

## 10.2 Connection Lifecycle

- [ ] Startup connection
- [ ] Connection failure handling
- [ ] Graceful shutdown
- [ ] Connection reuse
- [ ] Environment configuration

## 10.3 Integration Strategy

Evaluate integrations for:

```text
PostgreSQL
MySQL
MongoDB
```

Potentially through separate Kyuu packages.

## 10.4 CLI Integration

Eventually:

```bash
kyuu add postgres
kyuu add mongodb
```

Generate:

- [ ] Dependencies
- [ ] Configuration
- [ ] Database directory
- [ ] Environment variables
- [ ] Example connection

---

# Phase 11 — Redis

Goal: Make Redis integration similarly simple.

## 11.1 Redis Package

Potential package:

```text
@kyuujs/redis
```

- [ ] Connection API
- [ ] Configuration
- [ ] Connection lifecycle
- [ ] Error handling
- [ ] Graceful shutdown

## 11.2 Framework Integration

Potential:

```ts
redis({
  url: process.env.REDIS_URL,
});
```

## 11.3 CLI

Potential:

```bash
kyuu add redis
```

Generate:

```text
src/
└── infrastructure/
    └── redis/
        ├── client.ts
        └── config.ts
```

---

# Phase 12 — Background Jobs

Goal: Provide a clean convention around background processing.

## 12.1 Job Architecture

Potential structure:

```text
src/jobs/
└── email/
    ├── job.ts
    └── processor.ts
```

## 12.2 Job Definition API

Explore:

```ts
defineJob({
  name: "send-email",
  async process(data) {},
});
```

## 12.3 Queue Integration

Evaluate existing queue technologies rather than implementing a queue system from scratch.

Potential integration:

```text
BullMQ
```

## 12.4 Job Lifecycle

- [ ] Registration
- [ ] Worker startup
- [ ] Graceful shutdown
- [ ] Retry configuration
- [ ] Error handling
- [ ] Job observability

## 12.5 CLI

```bash
kyuu generate job email
```

---

# Phase 13 — Benchmark Package

Goal: Build Kyuu's dedicated benchmarking ecosystem.

Package:

```text
@kyuujs/benchmark
```

## 13.1 Benchmark Runner

- [ ] HTTP benchmark runner
- [ ] Configurable concurrency
- [ ] Configurable request count
- [ ] Duration-based benchmarks
- [ ] Warm-up period
- [ ] Multiple endpoints

## 13.2 Metrics

Capture:

```text
Requests/sec
Latency
p50
p90
p95
p99
Errors
Throughput
Memory
CPU
```

## 13.3 Framework Integration

Potential:

```bash
kyuu benchmark
```

Automatically understand:

- [ ] Running Kyuu application
- [ ] Routes
- [ ] Configuration
- [ ] Benchmark settings

## 13.4 Comparison Mode

Eventually:

```bash
kyuu benchmark --compare express
kyuu benchmark --compare fastify
```

## 13.5 Regression Detection

Potential:

```bash
kyuu benchmark --baseline
kyuu benchmark --compare-baseline
```

Detect:

```text
Performance regression
Latency regression
Memory regression
```

## 13.6 Benchmark Suite

Maintain permanent benchmarks for:

- [ ] Router
- [ ] Middleware
- [ ] JSON
- [ ] Request parsing
- [ ] Response serialization
- [ ] Parameters
- [ ] Query strings
- [ ] Errors
- [ ] Full HTTP request lifecycle

---

# Phase 14 — Docker and Production Development

Goal: Make production deployment straightforward.

## 14.1 Docker Support

Generate:

```text
Dockerfile
.dockerignore
docker-compose.yml
```

- [ ] Production Dockerfile
- [ ] Development Docker setup
- [ ] Environment variables
- [ ] Health checks

## 14.2 CLI

Potential:

```bash
kyuu docker
kyuu docker:init
```

## 14.3 Database + Redis Containers

Potential:

```bash
kyuu add postgres
kyuu add redis
```

and generate appropriate Compose configuration.

## 14.4 Production Build

- [ ] Production compilation
- [ ] Minimize unnecessary files
- [ ] Production dependency handling
- [ ] Startup command
- [ ] Graceful shutdown

---

# Phase 15 — Scaling and Multi-Core Architecture

Goal: Introduce process-level scaling only after the core runtime is mature.

## 15.1 Scaling Configuration

Potential:

```ts
export default defineConfig({
  scaling: {
    mode: "single",
  },
});
```

Future modes:

```text
single
cluster
workers
```

## 15.2 Worker Architecture

Explore:

```text
                    Kyuu
                      │
                Master Process
                      │
          ┌───────────┼───────────┐
          ↓           ↓           ↓
       Worker 1    Worker 2    Worker 3
```

- [ ] Worker spawning
- [ ] Worker lifecycle
- [ ] Worker crashes
- [ ] Worker restart
- [ ] Shutdown coordination

## 15.3 CPU Scaling

- [ ] Detect CPU count
- [ ] Auto instance configuration
- [ ] Manual instance configuration
- [ ] Benchmark scaling behavior

## 15.4 Deployment Strategy

Document:

```text
Single process
Multiple processes
Docker replicas
Container orchestration
```

Clarify when each approach should be used.

---

# Phase 16 — Production Hardening

Goal: Make Kyuu reliable enough for serious applications.

## 16.1 Graceful Shutdown

Handle:

```text
SIGTERM
SIGINT
```

- [ ] Stop accepting requests
- [ ] Finish active requests
- [ ] Stop background jobs
- [ ] Close DB connections
- [ ] Close Redis connections
- [ ] Exit cleanly

## 16.2 Error Handling

- [ ] Framework errors
- [ ] Application errors
- [ ] Startup errors
- [ ] Unhandled promise rejection strategy
- [ ] Uncaught exception strategy

## 16.3 Security Defaults

Evaluate:

- [ ] Secure headers
- [ ] Request size limits
- [ ] Body limits
- [ ] Timeout handling
- [ ] Prototype pollution considerations
- [ ] Path traversal concerns
- [ ] Error information leakage

## 16.4 Resource Protection

- [ ] Request timeouts
- [ ] Body size limits
- [ ] Header limits
- [ ] Connection handling
- [ ] Memory considerations

---

# Phase 17 — Developer Experience

Goal: Make Kyuu pleasant to use daily.

## 17.1 Error Messages

Errors should explain:

```text
What happened
Where it happened
Why it happened
How to fix it
```

## 17.2 Development Output

Potential development output:

```text
Kyuu

✓ Server started
✓ Routes loaded
✓ Configuration loaded

Local: http://localhost:3000

Routes:

GET    /users
POST   /users
GET    /users/:id
```

## 17.3 Hot Reloading

- [ ] File watching
- [ ] Restart server
- [ ] Handle configuration changes
- [ ] Handle route changes
- [ ] Handle crashes

## 17.4 Route Inspection

Potential:

```bash
kyuu routes
```

Output:

```text
METHOD   PATH
GET      /users
POST     /users
GET      /users/:id
DELETE   /users/:id
```

## 17.5 Project Diagnostics

Potential:

```bash
kyuu doctor
```

---

# Phase 18 — Documentation

Goal: Make the framework learnable without requiring users to inspect source code.

## 18.1 Getting Started

- [ ] Installation
- [ ] Create first project
- [ ] First route
- [ ] Middleware
- [ ] Request handling
- [ ] Response handling
- [ ] Configuration

## 18.2 Core Documentation

- [ ] Application
- [ ] Router
- [ ] Middleware
- [ ] Request
- [ ] Response
- [ ] Error handling
- [ ] TypeScript

## 18.3 Architecture Documentation

- [ ] Project structure
- [ ] File-system routing
- [ ] Controllers
- [ ] Services
- [ ] Database
- [ ] Jobs
- [ ] Redis

## 18.4 Production Documentation

- [ ] Environment variables
- [ ] Docker
- [ ] Logging
- [ ] Scaling
- [ ] Multi-process deployment
- [ ] Graceful shutdown
- [ ] Performance

## 18.5 API Reference

- [ ] Core API
- [ ] CLI commands
- [ ] Configuration API
- [ ] Integration packages

---

# Phase 19 — Testing and Quality Expansion

Goal: Move from "works" to "reliable."

## 19.1 Unit Testing

- [ ] Router
- [ ] Middleware
- [ ] Request
- [ ] Response
- [ ] Configuration
- [ ] CLI
- [ ] Utilities

## 19.2 Integration Testing

- [ ] Complete HTTP lifecycle
- [ ] Filesystem routing
- [ ] Middleware
- [ ] Database
- [ ] Redis
- [ ] Jobs
- [ ] Docker

## 19.3 Type Testing

- [ ] Parameter inference
- [ ] Query inference
- [ ] Request body types
- [ ] Response types
- [ ] Invalid API usage
- [ ] JavaScript compatibility

## 19.4 Stress Testing

- [ ] High concurrency
- [ ] Long-running requests
- [ ] Large payloads
- [ ] Many routes
- [ ] Many middleware layers
- [ ] Sustained traffic

## 19.5 Memory Testing

- [ ] Baseline memory
- [ ] Long-running process
- [ ] Repeated requests
- [ ] Large request bodies
- [ ] Route registration
- [ ] Memory leak detection

---

# Phase 20 — Performance Engineering

Goal: Ensure Kyuu remains competitive with Express.

## 20.1 Performance Baseline

Maintain benchmark results for:

```text
Kyuu
Express
Fastify
```

## 20.2 Hot Path Analysis

Investigate:

- [ ] Routing overhead
- [ ] Middleware overhead
- [ ] Request object creation
- [ ] Response object creation
- [ ] JSON serialization
- [ ] Header handling
- [ ] Promise creation
- [ ] Garbage collection
- [ ] Memory allocation

## 20.3 Optimization

Only optimize based on measured bottlenecks.

Potential areas:

- [ ] Route lookup
- [ ] Middleware compilation
- [ ] Lazy parsing
- [ ] Object allocation
- [ ] Serialization
- [ ] Handler dispatch

## 20.4 Performance Regression CI

Potentially:

```text
Pull Request
     ↓
Benchmark
     ↓
Compare baseline
     ↓
Performance regression?
     ↓
Fail / warn
```

---

# Phase 21 — Package Ecosystem

Goal: Separate framework functionality into maintainable packages.

Potential package ecosystem:

```text
@kyuujs/core
@kyuujs/cli
@kyuujs/benchmark
@kyuujs/redis
@kyuujs/postgres
@kyuujs/jobs
@kyuujs/docker
```

## Tasks

- [ ] Define package boundaries
- [ ] Avoid unnecessary dependencies
- [ ] Establish versioning strategy
- [ ] Establish package release workflow
- [ ] Establish dependency compatibility rules
- [ ] Document package relationships

---

# Phase 22 — Plugin / Extension System

Goal: Allow the ecosystem to extend Kyuu without modifying the core.

Potential:

```ts
app.usePlugin(plugin);
```

or:

```ts
definePlugin({
  name: "redis",
  setup(app) {},
});
```

## Tasks

- [ ] Plugin API design
- [ ] Plugin lifecycle
- [ ] Plugin configuration
- [ ] Plugin dependencies
- [ ] Plugin error handling
- [ ] Plugin documentation
- [ ] Plugin testing utilities

---

# Phase 23 — Release Engineering

Goal: Make Kyuu distributable as a real open-source framework.

## 23.1 Versioning

- [ ] Semantic versioning
- [ ] Release process
- [ ] Changelog generation
- [ ] Deprecation strategy

## 23.2 npm Publishing

- [ ] npm package metadata
- [ ] Package README
- [ ] Package exports
- [ ] Publish workflow
- [ ] Verify published packages

## 23.3 CI/CD

- [ ] Test on supported Node versions
- [ ] Build packages
- [ ] Typecheck
- [ ] Lint
- [ ] Benchmark
- [ ] Publish releases

## 23.4 GitHub

- [ ] Issue templates
- [ ] Pull request template
- [ ] Bug reporting
- [ ] Feature requests
- [ ] Discussions if useful
- [ ] Release notes

---

# Phase 24 — Real-World Validation

Goal: Prove Kyuu works outside isolated examples.

Build several applications using Kyuu.

## 24.1 Small API

```text
Users
Products
Authentication
```

Purpose:

- Validate basic developer experience.

## 24.2 Medium API

```text
Authentication
Users
Products
Orders
Payments
Database
Redis
Background jobs
Logging
Docker
```

Purpose:

- Validate architecture.

## 24.3 Large Application

Build a substantial application using:

```text
Filesystem routing
Controllers
Services
Schemas
Database
Redis
Jobs
Logging
Docker
Tests
```

Purpose:

- Validate whether the conventions actually remain useful at scale.

## 24.4 Developer Experience Review

After building real applications:

- [ ] Identify repetitive patterns
- [ ] Identify confusing APIs
- [ ] Identify unnecessary conventions
- [ ] Identify missing generators
- [ ] Identify poor error messages
- [ ] Identify performance bottlenecks
- [ ] Simplify where possible

---

# Phase 25 — First Stable Release

Goal: Decide whether Kyuu is ready to be considered a real framework.

## Stability Checklist

- [ ] Core API stable
- [ ] Router stable
- [ ] Middleware stable
- [ ] TypeScript API stable
- [ ] Filesystem routing stable
- [ ] CLI stable
- [ ] Configuration stable
- [ ] Error handling stable
- [ ] Documentation complete
- [ ] Tests comprehensive
- [ ] Benchmarks established
- [ ] No known critical memory leaks
- [ ] No known critical security issues
- [ ] Production deployment documented
- [ ] npm packages published
- [ ] Example applications working
- [ ] Performance compared against Express
- [ ] Breaking-change policy established

---

# Long-Term Feature Ideas

These are intentionally not committed to a specific phase yet.

## Developer Experience

- [ ] Interactive CLI
- [ ] Route visualization
- [ ] Dependency graph
- [ ] Project health checks
- [ ] Better development error pages
- [ ] Automatic API documentation
- [ ] OpenAPI integration

## Performance

- [ ] Compiled middleware pipelines
- [ ] Optimized serialization
- [ ] Route precompilation
- [ ] Worker architecture
- [ ] Performance profiling tools
- [ ] Automatic benchmark regression detection

## Architecture

- [ ] Dependency injection
- [ ] Modules
- [ ] Lifecycle hooks
- [ ] Application events
- [ ] Plugin ecosystem

## Infrastructure

- [ ] PostgreSQL integration
- [ ] MySQL integration
- [ ] MongoDB integration
- [ ] Redis
- [ ] Queues
- [ ] Cron jobs
- [ ] Object storage
- [ ] Email providers

## Deployment

- [ ] Docker
- [ ] Docker Compose
- [ ] Worker processes
- [ ] Cluster mode
- [ ] Health endpoints
- [ ] Readiness/liveness probes
- [ ] Graceful rolling deployment support

---

# Initial Definition of Done

Kyuu should eventually be able to take a developer from:

```bash
kyuu new my-api
```

to:

```text
my-api/
├── src/
│   ├── app/
│   │   ├── users/
│   │   │   ├── route.ts
│   │   │   ├── controller.ts
│   │   │   ├── service.ts
│   │   │   └── schema.ts
│   │   │
│   │   └── products/
│   │       ├── route.ts
│   │       ├── controller.ts
│   │       ├── service.ts
│   │       └── schema.ts
│   │
│   ├── database/
│   ├── middleware/
│   ├── jobs/
│   └── lib/
│
├── tests/
├── kyuu.config.ts
├── Dockerfile
├── package.json
└── tsconfig.json
```

and then:

```bash
kyuu dev
```

with an API that feels familiar to an Express developer:

```ts
app.get("/users/:id", async (req, res) => {
  const user = await users.findById(req.params.id);

  return res.json(user);
});
```

while providing:

```text
Express-like API
        +
Filesystem conventions
        +
Type safety
        +
CLI tooling
        +
Validation
        +
Logging
        +
Database integrations
        +
Redis
        +
Background jobs
        +
Docker
        +
Benchmarking
        +
Future worker/scaling support
```

without turning the core runtime into a bloated abstraction layer.

---

# Current Status

## Phase 0 — Project Foundation

- [ ] Not started

## Phase 1 — Core HTTP Runtime

- [ ] Not started

## Phase 2 — Router

- [ ] Not started

## Phase 3 — Middleware System

- [ ] Not started

## Phase 4 — Type Safety

- [ ] Not started

## Phase 5 — Configuration System

- [ ] Not started

## Phase 6 — File-System Based Architecture

- [ ] Not started

## Phase 7 — CLI

- [ ] Not started

## Phase 8 — Validation and Schema System

- [ ] Not started

## Phase 9 — Logging

- [ ] Not started

## Phase 10 — Database Integration

- [ ] Not started

## Phase 11 — Redis

- [ ] Not started

## Phase 12 — Background Jobs

- [ ] Not started

## Phase 13 — Benchmark Package

- [ ] Not started

## Phase 14 — Docker and Production Development

- [ ] Not started

## Phase 15 — Scaling and Multi-Core Architecture

- [ ] Not started

## Phase 16 — Production Hardening

- [ ] Not started

## Phase 17 — Developer Experience

- [ ] Not started

## Phase 18 — Documentation

- [ ] Not started

## Phase 19 — Testing and Quality Expansion

- [ ] Not started

## Phase 20 — Performance Engineering

- [ ] Not started

## Phase 21 — Package Ecosystem

- [ ] Not started

## Phase 22 — Plugin / Extension System

- [ ] Not started

## Phase 23 — Release Engineering

- [ ] Not started

## Phase 24 — Real-World Validation

- [ ] Not started

## Phase 25 — First Stable Release

- [ ] Not started
