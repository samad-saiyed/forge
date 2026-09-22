# 1. What should `kyuu build` actually do?

I recommend:

```text
kyuu build
   │
   ├── locate project
   ├── load/validate configuration
   ├── discover application routes
   ├── validate route modules
   ├── compile application
   └── produce production artifact
```

The output should be something like:

```text
.kyuu/
└── build/
    ├── ...
    └── manifest.json
```

The exact directory/name can be decided based on the existing project conventions.

The important part is that **`build` produces a clearly identifiable Kyuu-owned artifact**.

---

# 2. I don't think we should bundle by default

This is where I want Kyuu to remain deliberately different.

We don't need to immediately create:

```text
one enormous JavaScript bundle
```

just because that's what some frameworks do.

Given our architecture, I'd prefer the initial production model to be:

```text
TypeScript
   ↓
JavaScript compilation
   ↓
preserve module structure
   ↓
production artifact
```

rather than:

```text
TypeScript
   ↓
bundler
   ↓
giant bundle
```

Why?

Because our runtime already has a straightforward Node/ESM architecture.

Bundling introduces a substantial new system:

- module resolution;
- dependency externalization;
- asset handling;
- package compatibility;
- dynamic import handling;
- source-map behavior;
- plugin ecosystem;
- bundler-specific edge cases.

We don't need that complexity merely to say Kyuu has a `build` command.

**Bundling can be a later optimization if benchmarks justify it.**

---

# 3. Filesystem routes in production

This is an important architectural question.

Development currently does:

```text
src/app
   ↓
filesystem discovery
   ↓
route registration
```

For production, I would **not make every request trigger filesystem discovery**. Obviously, discovery should still happen only once during startup.

But we have two reasonable choices.

### Option A — discover filesystem at `start`

```text
kyuu build
   ↓
compile files

kyuu start
   ↓
discover compiled filesystem routes
   ↓
register
   ↓
serve
```

### Option B — build a route manifest

```text
kyuu build
   ↓
discover routes
   ↓
generate manifest
```

Then:

```text
kyuu start
   ↓
read manifest
   ↓
load known route modules
   ↓
serve
```

I strongly prefer **Option B eventually**, but we need to be careful about introducing a manifest before we actually need it.

A production manifest gives us:

- deterministic route inventory;
- faster startup;
- easier diagnostics;
- potential future route inspection;
- no dependency on source filesystem conventions at runtime;
- a natural place for build metadata.

It also fits very nicely with our existing filesystem routing work.

---

# 4. The build artifact should contain route information

Conceptually:

```text
.kyuu/build/
├── server/
│   ├── ...
├── routes/
│   ├── ...
└── manifest.json
```

The manifest could eventually describe:

```json
{
  "routes": [
    {
      "method": "GET",
      "pattern": "/users/:id",
      "module": "./routes/users/[id]/route.js"
    }
  ]
}
```

But **don't lock yourself into this exact schema yet**.

The important architectural decision is:

> The build process knows the complete route graph and records enough information for production startup to reproduce it deterministically.

---

# 5. What happens to `kyuu.config.ts`?

This deserves special treatment.

We currently have:

```text
kyuu.config.ts
   ↓
configuration loader
   ↓
resolved config
```

For `kyuu build`, we should load and validate it.

But I would **not blindly bake the entire resolved configuration into the build artifact**.

Some configuration is build-time:

```text
build-related options
```

while some is runtime:

```text
server.port
server.host
```

and potentially later:

```text
database credentials
environment-dependent configuration
```

So we should establish:

```text
Build-time configuration
        ≠
Runtime configuration
```

This becomes especially important when someone builds once and deploys the same artifact to multiple environments.

---

# 6. `kyuu start` should load runtime configuration

Therefore I recommend:

```text
kyuu build
   ↓
build artifact

kyuu start
   ↓
load runtime configuration
   ↓
load build artifact
   ↓
start application
```

Not:

```text
kyuu build
   ↓
freeze everything forever
   ↓
kyuu start
```

For example, the same build could theoretically run with:

```text
PORT=3000
```

and later:

```text
PORT=8080
```

without rebuilding the application.

That's a much healthier production model.

---

# 7. What exactly does `kyuu start` require?

I recommend:

```bash
kyuu start
```

requires a successful build.

If no artifact exists:

```text
No Kyuu production build found.

Run:
  kyuu build
```

This is much clearer than silently falling back to development behavior.

And importantly:

> `kyuu start` must never behave like `kyuu dev`.

No watcher.

No source-file restart.

No development route scanning.

No development-only diagnostics.

---

# 8. Production startup architecture

The intended architecture becomes:

```text
                    DEVELOPMENT

kyuu dev
   │
   ├── config
   ├── source routes
   ├── application
   ├── server
   └── watcher
          │
          └── restart


                    PRODUCTION

kyuu build
   │
   ├── config validation
   ├── source routes
   ├── compilation
   └── build artifact
          │
          ▼
       artifact


kyuu start
   │
   ├── runtime config
   ├── build manifest
   ├── compiled routes
   ├── application
   └── server
```

That's a clean separation.

---

# 9. What about manual `app.get()` routes?

They need to remain supported.

This is actually an important consideration for the build architecture.

Suppose the application has:

```ts
app.get("/health", handler);
```

and filesystem routes:

```text
src/app/users/route.ts
```

The production artifact must preserve both.

So the build system cannot only understand filesystem routes.

We need to preserve the application's normal programmatic registration.

Conceptually:

```text
Application code
      │
      ├── manual routes
      │
      └── filesystem routes
                │
                ▼
          production app
```

This is another reason I don't want to prematurely create a filesystem-only production manifest that replaces the application's normal registration model.

---

# 10. `kyuu.config.ts` can potentially export application configuration

We previously agreed that users mainly interact with:

```text
kyuu.config.ts
```

rather than manually wiring bootstrap/listen logic.

So we should preserve that model.

The configuration should describe the application, while the CLI owns the lifecycle:

```text
kyuu.config.ts
        ↓
Kyuu CLI
        ↓
Kyuu Core
```

No requirement for users to create:

```text
server.ts
bootstrap.ts
index.ts
```

just to make production work.

---

# 11. TypeScript vs JavaScript projects

The build command should normalize both into a production runtime representation.

### TypeScript

```text
.ts
 ↓
compiled JS
```

### JavaScript

```text
.js
 ↓
production artifact
```

We should avoid forcing JavaScript users through an unnecessary TypeScript compilation step.

The build pipeline should understand the selected project language.

---

# 12. Dependencies

Initially, I'd keep production dependencies **external** rather than bundling them.

So:

```text
application artifact
      +
node_modules
      ↓
production runtime
```

rather than trying to package the entire dependency graph into one file.

This is much closer to how a normal Node application naturally operates and avoids introducing unnecessary bundler complexity.

---

# 13. Source maps

I would support source maps for compiled TypeScript output.

That means production errors can still point toward:

```text
src/app/users/route.ts
```

rather than only:

```text
dist/app/users/route.js
```

But we don't need to build an elaborate error-reporting system yet.

Just preserve useful source-map information through the build.

---

# 14. Build failures

`kyuu build` should fail deterministically.

Examples:

```text
TypeScript compilation failed
```

```text
Invalid kyuu.config.ts
```

```text
Route module failed to load
```

```text
Invalid route definition
```

The command should:

- return non-zero;
- not claim the build succeeded;
- avoid leaving an obviously invalid artifact marked as current.

Ideally, build into a temporary/staging location and promote it to the final build directory only after success.

That gives us an atomic-ish build boundary.

---

# 15. Repeated builds

Running:

```bash
kyuu build
kyuu build
kyuu build
```

should be deterministic.

Don't accumulate:

```text
.kyuu/build-1
.kyuu/build-2
.kyuu/build-3
```

unless there is a specific reason.

The current successful build should have a well-defined location.

---

# 16. Clean builds

We should eventually have a way to remove stale artifacts.

But **don't add `kyuu clean` yet** unless we discover that the build implementation genuinely requires it.

For Action 70, the build command itself should safely replace the previous build.

---

# 17. Build metadata

The artifact should contain enough metadata to know what generated it.

For example:

```text
Kyuu version
build format/version
project language
route information
```

Don't over-design the manifest.

But include an explicit **artifact format/version**.

That becomes valuable later if Kyuu changes its build representation.

---

# 18. The build should be independent of the current machine

This is a major goal.

Avoid putting things like:

```text
absolute source paths
user home directory
machine-specific paths
```

into the artifact.

Prefer project-relative paths.

We want:

```text
build
  ↓
copy artifact
  ↓
different environment
  ↓
kyuu start
```

to be conceptually possible.

---

# 19. Security boundary

`kyuu build` should not execute arbitrary application runtime behavior more than necessary.

Loading route modules/config may execute user code because they're JavaScript/TypeScript modules.

That's unavoidable to some degree.

But avoid introducing mechanisms where the build system itself executes:

```text
application requests
database operations
server startup
```

The build should validate/compile, not run the application as a server.

---

# 20. Proposed final model

If we lock this in, Kyuu becomes:

```text
             SOURCE PROJECT

        kyuu.config.ts
               │
        src/app/**/*.ts
               │
               ▼
         kyuu build
               │
       ┌───────┴────────┐
       │                │
   compile          route graph
       │                │
       └───────┬────────┘
               ▼
        .kyuu/build/
               │
               ▼
          kyuu start
               │
       runtime config
               │
               ▼
        Kyuu Application
               │
               ▼
             HTTP
```

And development remains:

```text
src
 │
 ▼
kyuu dev
 │
 ├── discover
 ├── start
 └── watch → restart
```

---

# The decisions I'd lock now

I recommend we agree on these **before Action 70**:

| Decision                           | Recommendation       |
| ---------------------------------- | -------------------- |
| Build exists separately from start | **Yes**              |
| `start` requires build             | **Yes**              |
| Default bundling                   | **No**               |
| Compile TS                         | **Yes**              |
| Preserve ESM/module structure      | **Yes**              |
| Externalize dependencies           | **Yes**              |
| Route discovery at build           | **Yes**              |
| Production route manifest          | **Yes, but minimal** |
| Runtime config loaded at start     | **Yes**              |
| Build config frozen into artifact  | **No**               |
| Manual`app.get()` support          | **Yes**              |
| Source maps                        | **Yes**              |
| Watch/restart in build             | **No**               |
| HMR                                | **No**               |
| Atomic/staged build output         | **Yes**              |
| Build artifact version metadata    | **Yes**              |
| `kyuu clean`                       | **Later**            |

### One thing I'd change from the table if we discover a constraint

The **route manifest should not replace the Application's normal route registration mechanism**.

It should be an optimization/description of the already-established route graph, not a second routing system.

That keeps us away from exactly the kind of framework duplication you were concerned about earlier.

If this production model looks right to you, we can lock it and then I'll turn it into **Action 70 — `kyuu build`**, with implementation-level instructions and a strict Definition of Done.
