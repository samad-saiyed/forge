import { readFileSync } from "node:fs";

/**
 * Returns the authoritative version string from package.json.
 */
export function getVersion(): string {
  try {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const pkgContent = readFileSync(pkgUrl, "utf8");
    const pkg = JSON.parse(pkgContent) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
