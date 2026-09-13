import { relative, resolve } from "node:path";
import { mapSourceToBuildPath, toPosixPath } from "./build.js";
import { findConfigFile, loadConfig, type ResolvedForgeConfig } from "./config.js";
import { detectProjectLanguage } from "./js-builder.js";

export interface ProductionBuildConfig {
  projectRoot: string;
  configFile: string | null;
  configPathRelative: string;
  resolvedConfig: ResolvedForgeConfig;
  language: "typescript" | "javascript";
}

export class BuildConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BuildConfigError";
  }
}

/**
 * Loads, validates, and resolves configuration for a production build using Forge's core config loader.
 */
export async function loadProductionBuildConfig(
  projectRoot: string,
): Promise<ProductionBuildConfig> {
  const root = resolve(projectRoot);
  let resolvedConfig: ResolvedForgeConfig;
  let configFileFullPath: string | null = null;

  try {
    configFileFullPath = findConfigFile(root);
    resolvedConfig = await loadConfig(root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BuildConfigError(`Production build configuration failure: ${message}`, {
      cause: err,
    });
  }

  const language = detectProjectLanguage(root);

  let configPathRelative = "forge.config.js";
  if (configFileFullPath) {
    const rawRelative = toPosixPath(relative(root, configFileFullPath));
    configPathRelative = mapSourceToBuildPath(rawRelative, language);
  }

  return {
    projectRoot: root,
    configFile: configFileFullPath ? toPosixPath(relative(root, configFileFullPath)) : null,
    configPathRelative,
    resolvedConfig,
    language,
  };
}
