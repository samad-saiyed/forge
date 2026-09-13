Yes. This is worth designing **before we touch the scanner**, because the combination of filesystem routes + imperative `app.get()` routes + an exported app instance creates several ordering, ownership, and lifecycle questions that will become painful if we don't settle them now.

I think your direction is good, and importantly, **Forge should not become an Express clone**. The imperative API is a compatibility/flexibility layer; the filesystem convention should be the higher-level architecture.

## 1. The model I think we should build

A Forge application has **two route registration mechanisms**:

```text
                 Forge Application
                        │
             ┌──────────┴──────────┐
             │                     │
      Filesystem routes      Imperative routes
             │                     │
       src/app/**/route.ts      app.get(...)
             │                     │
             └──────────┬──────────┘
                        │
                   Route Registry
                        │
                     Router
```

Both ultimately become ordinary routes in the same router.

That is the key architectural decision.

Filesystem routing should **not** introduce a second routing engine.

---

# 2. Your filesystem convention

I would make this the canonical convention:

```text
src/
└── app/
    ├── route.ts
    ├── users/
    │   └── route.ts
    ├── users/
    │   └── [id]/
    │       └── route.ts
    └── files/
        └── [...path]/
            └── route.ts
```

Which produces:

```text
src/app/route.ts
        → /

src/app/users/route.ts
        → /users

src/app/users/[id]/route.ts
        → /users/:id

src/app/files/[...path]/route.ts
        → /files/*path
```

And:

```ts
export const GET = async (req, res) => {
  // ...
};

export const POST = async (req, res) => {
  // ...
};
```

A single `route.ts` can therefore represent multiple HTTP methods.

That's clean.

---

# 3. But I strongly agree with your second requirement

You should **not be forced into filesystem routing**.

Given:

```text
src/app/users/route.ts
```

the user should be able to write:

```ts
export const GET = ...
```

and also have an application instance available to register imperative routes.

For example:

```ts
const app = createApp();

app.get("/users/:id", handler);

export default app;
```

or whatever exact application-export convention we settle on.

This means the user can choose:

### Convention A — filesystem

```text
users/[id]/route.ts
```

### Convention B — imperative

```ts
app.get("/users/:id", ...)
```

### Convention C — hybrid

```text
users/route.ts
users/[id]/route.ts
```

plus:

```ts
app.get("/health", ...)
app.get("/internal/stats", ...)
```

I think **hybrid is essential**.

It gives Forge a convention without turning the convention into a prison.

---

# 4. One thing I would change from your wording

You said:

> if user is in `/app/users/route.ts` ... `app.get('/:id')`

I would **not make the physical location of `route.ts` implicitly prefix imperative routes**.

So:

```text
src/app/users/route.ts
```

and:

```ts
app.get("/:id", handler);
```

should mean:

```text
/:id
```

not:

```text
/users/:id
```

Why?

Because otherwise we're giving `app.get()` two meanings:

```ts
app.get("/users/:id");
```

means absolute application route,

but:

```ts
// inside src/app/users/route.ts
app.get("/:id");
```

means relative route.

That becomes extremely difficult to reason about.

Instead, if you want `/users/:id`, use either:

```text
src/app/users/[id]/route.ts
```

or:

```ts
app.get("/users/:id", handler);
```

**Filesystem location should control filesystem routes only.**

Imperative routes should always use application-rooted paths.

That's much cleaner.

---

# 5. What should `route.ts` export?

This is where I think we need to be disciplined.

I'd support:

```ts
export const GET = ...
export const POST = ...
export const PUT = ...
export const PATCH = ...
export const DELETE = ...
export const OPTIONS = ...
export const HEAD = ...
```

Potentially later:

```ts
export const middleware = ...
```

But **not yet**.

We should avoid turning `route.ts` into a dumping ground for every possible Forge feature.

A route module should primarily describe:

> "These are the HTTP handlers associated with this filesystem route."

---

# 6. What does the default export mean?

This is one of the things I'd settle now.

I recommend:

**Do not use the default export for HTTP handlers.**

Use named method exports exclusively.

```ts
export const GET = ...
export const POST = ...
```

Then the default export can remain available for framework/application-level purposes if we eventually need it.

This prevents ambiguity such as:

```ts
export default handler;
```

What HTTP method does that mean?

GET?

ALL?

Something else?

Named methods eliminate that entire class of problems.

---

# 7. The application instance question is more important

You said:

> app instance should be exported naturally to be used by application context

I agree with the underlying goal, but I'd separate **application creation** from **route discovery**.

I don't want this:

```text
route.ts
   ↓
creates Application
   ↓
Application scans route.ts
   ↓
route.ts creates Application
   ↓
...
```

That's a circular architecture.

Instead, we should eventually have something conceptually like:

```text
                    bootstrap
                       │
                       ▼
                create Application
                       │
                       ▼
                load configuration
                       │
                       ▼
                 discover routes
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
     filesystem routes      imperative routes
            │                     │
            └──────────┬──────────┘
                       ▼
                  Router
                       │
                       ▼
                    listen
```

The **bootstrap/application context owns the Application**.

Route modules should register behavior into it; they shouldn't own the lifecycle.

That will save us a lot of trouble later.

---

# 8. We need to distinguish "route module" from "application entry"

I think this will become important.

For example:

```text
src/
├── app/
│   ├── route.ts
│   └── users/
│       └── route.ts
│
└── main.ts
```

`main.ts` can eventually be the application entry:

```ts
const app = createApp();

export default app;
```

or potentially:

```ts
export const app = createApp();
```

Then Forge's runtime/CLI discovers the application and routes.

This gives us a clean division:

```text
main.ts
→ application ownership

app/**/route.ts
→ HTTP route definitions
```

I'd strongly prefer this over requiring every `route.ts` to export the app.

---

# 9. But what about imperative routes?

This is where we need to make a deliberate decision.

I see two good options.

### Option A — application entry

```ts
// main.ts

const app = createApp();

app.get("/health", ...);
app.get("/users/:id", ...);

export default app;
```

Filesystem routes are discovered separately.

This is my preferred architecture.

### Option B — route module receives application

```ts
export default function register(app) {
  app.get(...);
}
```

I **don't** recommend this.

It makes filesystem modules less declarative and creates more complicated loading semantics.

Your `GET`/`POST` convention is much nicer.

---

# 10. Route collisions are going to matter

Suppose somebody creates:

```text
users/[id]/route.ts
```

which produces:

```text
GET /users/:id
```

and then writes:

```ts
app.get("/users/:id", ...)
```

What happens?

We need a deterministic policy.

I recommend:

> **Duplicate method + normalized path registration is an error.**

So this:

```text
GET /users/:id
GET /users/:id
```

should fail during application initialization.

Don't silently pick one.

Don't rely on registration order.

Don't allow filesystem routes to mysteriously override imperative routes.

That would make debugging awful.

---

# 11. Static vs dynamic precedence remains router responsibility

For:

```text
/users/me
/users/[id]
```

we should register:

```text
GET /users/me
GET /users/:id
```

and the router should choose:

```text
/users/me
```

for `/users/me`.

That's exactly where the work we've already done on route scoring becomes valuable.

Filesystem routing should **translate conventions into normal routes**.

It should not implement precedence itself.

---

# 12. Trailing slash and URL normalization

We already encountered this with the router.

Filesystem routing should produce canonical route paths:

```text
/users
/users/:id
```

not variants like:

```text
/users/
/users/:id/
```

The router remains responsible for runtime pathname normalization.

Again: one concern per layer.

---

# 13. Dynamic segment naming

I'd use:

```text
[id]
```

→ `:id`

and:

```text
[username]
```

→ `:username`

That's straightforward.

For wildcards, I agree with the idea of:

```text
[...path]
```

→ `*path`

because it is immediately understandable.

But we should define whether:

```text
/files/[...path]/route.ts
```

matches:

```text
/files/a
/files/a/b
/files/a/b/c
```

and whether it matches:

```text
/files
```

I'd recommend **one-or-more segments**, not zero-or-more.

So:

```text
/files
```

would not match the wildcard route.

If someone wants `/files` they create:

```text
files/route.ts
```

That keeps semantics predictable.

---

# 14. What about `[id]` with weird names?

We should validate filesystem segment names.

For example:

```text
[user-id]
```

would create an invalid JavaScript identifier-like parameter.

Do we permit that?

I'd recommend initially:

```text
[a-zA-Z0-9_]+
```

for dynamic parameter names.

Then:

```text
[user_id]
```

works.

```text
[user-id]
```

is invalid.

This avoids having to invent escaping/normalization rules.

---

# 15. Static directory names need validation too

Eventually we'll encounter:

```text
src/app/users/profile/route.ts
```

which is simple.

But what about:

```text
src/app/.well-known/route.ts
```

or:

```text
src/app/_internal/route.ts
```

We need conventions.

My recommendation:

### `_` prefix

Reserved for framework/internal files and ignored by route discovery.

So:

```text
src/app/_components/
src/app/_lib/
```

can safely exist without accidentally becoming routes.

This becomes very useful once applications grow.

---

# 16. Non-route files should simply be ignored

This:

```text
src/app/
├── users/
│   ├── route.ts
│   ├── schema.ts
│   ├── service.ts
│   └── types.ts
```

should be perfectly valid.

Only:

```text
route.ts
```

has routing semantics.

That gives developers freedom to colocate supporting code.

---

# 17. What about route.ts exports that aren't HTTP methods?

We need to avoid making the scanner brittle.

For example:

```ts
export const GET = ...
export const config = ...
export const metadata = ...
```

The scanner should not complain merely because `config` exists.

It should recognize known framework exports and ignore other exports unless they violate something important.

Later we can establish additional conventions.

---

# 18. HTTP method duplication within a module

This is naturally prevented by JavaScript:

```ts
export const GET = handler1;
export const GET = handler2;
```

doesn't work.

So that's easy.

But this:

```text
users/route.ts
users/index.ts
```

should not both become `/users`.

Only `route.ts` has route semantics.

---

# 19. Route discovery timing

This is another important architectural decision.

I recommend:

```text
Application created
        ↓
Routes discovered
        ↓
Routes registered
        ↓
Application starts
```

not:

```text
Application starts
        ↓
scan filesystem
        ↓
add routes
```

Why?

Because once the server is listening, route registration should ideally be immutable.

That gives us:

- deterministic startup
- simpler concurrency
- easier testing
- easier production behavior
- cleaner future hot-reload implementation

Hot reload can later explicitly rebuild/re-register routes if we want it.

---

# 20. We should keep route registration mutable only during bootstrap

Conceptually:

```text
CREATED
  ↓
DISCOVERING
  ↓
READY
  ↓
RUNNING
```

We already have:

```text
created
starting
running
stopping
stopped
```

We don't necessarily need a new public state immediately.

But internally, route discovery should happen before `running`.

This ties nicely into the application lifecycle work we've already done.

---

# 21. Error handling during discovery

If this file contains:

```ts
export const GET = ...
```

but the module itself throws while importing:

```ts
throw new Error("broken");
```

Forge should fail **application startup**, not produce a mysterious 500 when someone eventually hits that route.

Similarly:

```ts
export const GET = "hello";
```

should fail during discovery because it isn't a valid handler.

These are configuration/application startup errors.

---

# 22. We should not eagerly execute handlers

Discovery should import the module and register the function.

It should **not call it**.

So:

```ts
export const GET = async () => {
  ...
};
```

doesn't execute during startup.

Only:

```text
HTTP request
    ↓
router
    ↓
handler
```

executes it.

---

# 23. The really important issue: route module side effects

Filesystem discovery means importing arbitrary user code.

For example:

```ts
console.log("hello");

export const GET = ...
```

That executes during startup.

That's normal and unavoidable with JavaScript modules.

But it means we should document:

> Route modules are loaded during application initialization and should not depend on request-time state during module evaluation.

This will matter later for DI/application context.

---

# 24. Application context should be designed now, but implemented later

You mentioned:

> used by application context

I think that's the right long-term direction.

Eventually:

```text
ApplicationContext
├── config
├── application
├── router
├── logger
├── dependencies
└── lifecycle
```

Route handlers receive:

```text
Request
Response
```

and eventually can access application services through an established mechanism.

But **we shouldn't prematurely build DI just to support filesystem routes**.

We should design the route loader so it can receive an `ApplicationContext` later.

---

# 25. My proposed final architecture

I'd aim for this:

```text
                    Forge CLI / bootstrap
                            │
                            ▼
                    ApplicationContext
                            │
                  ┌─────────┴─────────┐
                  │                   │
              ResolvedConfig     Application
                                      │
                         ┌────────────┴────────────┐
                         │                         │
                  Filesystem loader          Imperative API
                         │                         │
                  src/app/**/route.ts         app.get(...)
                         │                         │
                         └────────────┬────────────┘
                                      ▼
                                 Route Registry
                                      │
                                      ▼
                                   Router
                                      │
                                      ▼
                                  HTTP Server
```

This is **not an Express clone**.

Express-style:

```ts
app.get(...)
```

is merely one low-level registration mechanism.

Forge's actual architectural value becomes:

```text
filesystem conventions
+
typed route definitions
+
automatic discovery
+
application context
+
configuration
+
fast router/runtime
```

That's a fundamentally different proposition.

---

# 26. Decisions I'd lock before implementation

I think we should agree on these **11 decisions** before Action #58:

| Decision                  | My recommendation         |
| ------------------------- | ------------------------- |
| Filesystem root           | `src/app`                 |
| Route module              | `route.ts`                |
| Static folder             | `/users`                  |
| Dynamic folder            | `[id]` → `:id`            |
| Wildcard folder           | `[...path]` → `*path`     |
| HTTP handlers             | `GET`, `POST`, etc.       |
| Default export as handler | **No**                    |
| Imperative routes         | Supported                 |
| Imperative route paths    | Always application-rooted |
| Duplicate route/method    | Startup error             |
| `_` prefixed dirs/files   | Reserved/ignored          |

And one **architectural decision** I'd particularly like to lock:

> **`route.ts` defines routes; the application entry owns the `Application` instance and lifecycle.**

That gives us a very clean foundation for everything that comes later—middleware, plugins, DI, config, testing, and eventually the CLI—without making filesystem routing responsible for things it shouldn't own.

If we agree on that model, **I would then turn these decisions into the formal filesystem-routing spec before writing the scanner.**
