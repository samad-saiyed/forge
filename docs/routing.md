# Routing System

Forge includes a built-in router designed for high performance, predictable route matching, and support for parameters and wildcards.

---

## HTTP Method Registration

Routes are registered using standard HTTP method calls on the `Application` instance:

```typescript
app.get("/users", listUsers);
app.post("/users", createUser);
app.put("/users/:id", updateUser);
app.patch("/users/:id", patchUser);
app.delete("/users/:id", deleteUser);
app.options("/users", optionsHandler);
app.head("/users", headHandler);
```

Method chaining is supported:

```typescript
app.get("/posts", getPosts).post("/posts", createPost);
```

---

## Dynamic Route Parameters

Route paths can include dynamic parameter segments declared with `:paramName`:

```typescript
app.get("/users/:id/posts/:postId", (req, res) => {
  const userId = req.params.id;
  const postId = req.params.postId;

  return res.json({ userId, postId });
});
```

All route parameters are automatically decoded and populated on `req.params`.

---

## Wildcard Routes

Wildcards capture remaining URL path segments using `*`:

```typescript
app.get("/files/*", (req, res) => {
  const wildcardPath = req.params["*"];
  return res.json({ requestedFile: wildcardPath });
});
```

---

## Route Precedence Rules

When multiple routes overlap, Forge evaluates route precedence based on segment specificity scores:

1. **Static Segments** (highest priority) — e.g. `/users/me`
2. **Dynamic Parameter Segments** — e.g. `/users/:id`
3. **Wildcard Segments** (lowest priority) — e.g. `/users/*`

### Example Precedence Evaluation

Given the following registered routes:

```typescript
app.get("/users/me", staticHandler);
app.get("/users/:id", dynamicHandler);
app.get("/users/*", wildcardHandler);
```

- Request `GET /users/me` ──► Matches `staticHandler`
- Request `GET /users/123` ──► Matches `dynamicHandler`
- Request `GET /users/123/profile/details` ──► Matches `wildcardHandler`

---

## Path Normalization

Paths undergo automatic normalization:

- Trailing slashes are trimmed (e.g. `/users/` is normalized to `/users`).
- Leading slashes are ensured.
- Query parameters (e.g. `?search=term`) are separated prior to route matching.
