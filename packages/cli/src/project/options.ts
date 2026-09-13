export type ProjectLanguage = "typescript" | "javascript";
export type PackageManager = "pnpm" | "npm" | "yarn";

export interface ProjectCreationOptions {
  name: string;
  directory: string;
  language: ProjectLanguage;
  packageManager: PackageManager;
  initializeGit: boolean;
  skipInstall?: boolean;
}
