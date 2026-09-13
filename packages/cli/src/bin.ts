#!/usr/bin/env node
import { runCli } from "./dispatcher.js";

runCli(process.argv.slice(2))
  .then(({ exitCode }) => {
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
