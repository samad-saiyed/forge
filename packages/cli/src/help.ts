/**
 * Returns the concise help text for the Forge CLI foundation.
 */
export function getHelpText(): string {
  return [
    "Forge CLI",
    "",
    "Usage:",
    "  forge <command> [options]",
    "",
    "Commands:",
    "  dev         Start development server with live reload",
    "  build       Build production application artifact",
    "  start       Start production application server",
    "  new         Scaffold a new Forge project",
    "",
    "Options:",
    "  -h, --help       Show help",
    "  -v, --version    Show version",
    "",
    'Run "forge --help" for available commands.',
  ].join("\n");
}
