/**
 * Returns the concise help text for the Kyuu CLI foundation.
 */
export function getHelpText(): string {
  return [
    "Kyuu CLI",
    "",
    "Usage:",
    "  kyuu <command> [options]",
    "",
    "Commands:",
    "  dev         Start development server with live reload",
    "  build       Build production application artifact",
    "  start       Start production application server",
    "  new         Scaffold a new Kyuu project",
    "",
    "Options:",
    "  -h, --help       Show help",
    "  -v, --version    Show version",
    "",
    'Run "kyuu --help" for available commands.',
  ].join("\n");
}
