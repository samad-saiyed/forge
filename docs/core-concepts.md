# Core Concepts

This document details the core runtime abstractions provided by `@forge/core`.

---

## Application Factory & Lifecycle

### Creating an Application

The primary entry point to Forge is the `createApp()` factory function:

```typescript
import { createApp } from "@forge/core";

const app = createApp();
```

### Application State Transitions

An `Application` instance moves through an explicit state machine:

```text
created ──► starting ──► running ──► stopping ──► stopped
```

State transitions occur automatically during server startup and shutdown:

- `app.listen(port)` transition from `created` to `starting`, and then to `running` once bound to the network port.
- `app.close()` gracefully transitions from `running` to `stopping`, closing server connections, and reaching `stopped`.

---

## Request API (`Request`)

The `Request` class wraps Node.js's native `IncomingMessage` while providing clean helper getters:

```typescript
app.get("/search", (req, res) => {
  // HTTP Method (e.g. "GET")
  const method = req.method;

  // Raw URL path (e.g. "/search?q=forge")
  const url = req.url;

  // Headers map
  const userAgent = req.headers["user-agent"];

  // Route path parameters (e.g. req.params.id)
  const params = req.params;

  // Query parameters object (parsed from URL query string)
  const query = req.query;

  // Parsed body (if provided)
  const body = req.body;
});
```

---

## Response API (`Response`)

The `Response` class wraps Node.js's native `ServerResponse` with an Express-like fluent API:

```typescript
app.get("/json", (req, res) => {
  // Set status code
  res.status(200);

  // Set response headers
  res.setHeader("X-Custom-Header", "Forge");

  // Send JSON payload (sets Content-Type: application/json)
  return res.json({ success: true });
});

app.get("/text", (req, res) => {
  // Send plain text / buffer response
  return res.send("Hello from Forge!");
});
```

To prevent header mutations after responses have completed, `Response` guards against duplicate responses.

---

## Error Handling

Forge provides centralized error handling for both synchronous and asynchronous route handlers:

```typescript
// Synchronous handler throwing an error
app.get("/sync-error", () => {
  throw new Error("Something went wrong");
});

// Asynchronous handler throwing an error
app.get("/async-error", async () => {
  await doAsyncWork();
  throw new Error("Async failure");
});
```

### Environment-Aware Error Behavior

- **Development Mode (`NODE_ENV !== "production"`):**  
  Returns status `500` with JSON detailing the error message:

  ```json
  {
    "error": "Internal Server Error",
    "message": "Something went wrong"
  }
  ```

- **Production Mode (`NODE_ENV === "production"`):**  
  Returns status `500` with generic error JSON to prevent leaking internal stack traces:

  ```json
  {
    "error": "Internal Server Error"
  }
  ```

- **404 Not Found:**  
  Requests matching no registered route return status `404`.
