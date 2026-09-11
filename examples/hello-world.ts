import { createApp } from "../packages/core/src/index.js";

const app = createApp();

app.get("/", (_req, res) => {
  res.json({
    framework: "Forge",
    message: "Welcome to Forge framework!",
    timestamp: new Date().toISOString(),
  });
});

app.get("/users/:id", (req, res) => {
  res.json({
    message: "User detail endpoint",
    userId: req.params.id,
  });
});

app.post("/echo", (req, res) => {
  res.status(201).json({
    status: "created",
    receivedQuery: req.query,
  });
});

app.listen(3000);
console.log("🚀 Forge server is running at http://localhost:3000");
console.log("Try visiting in browser or curl:");
console.log("  http://localhost:3000/");
console.log("  http://localhost:3000/users/42");
