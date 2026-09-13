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
    "Options:",
    "  -h, --help       Show help",
    "  -v, --version    Show version",
    "",
    'Run "forge --help" for available commands.',
  ].join("\n");
}
