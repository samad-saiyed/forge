export {
  Application,
  createApp,
  type ApplicationOptions,
  type Middleware,
  type ErrorMiddleware,
  type RouteHandler,
  type RequestHandler,
  type NextFunction,
  type ParseRouteParams,
} from "./application.js";
export { Request } from "./request.js";
export { Response } from "./response.js";
export { Router, type RouteMatch } from "./router.js";
export {
  defineConfig,
  resolveConfig,
  validateConfig,
  findConfigFile,
  loadConfigFile,
  loadConfig,
  DEFAULT_CONFIG,
  type ServerConfig,
  type LoggingOptions,
  type LoggingConfig,
  type BenchmarkingOptions,
  type BenchmarkingConfig,
  type DevelopmentOptions,
  type DevelopmentConfig,
  type ForgeConfigInput,
  type ResolvedServerConfig,
  type ResolvedLoggingConfig,
  type ResolvedBenchmarkingConfig,
  type ResolvedDevelopmentConfig,
  type ResolvedForgeConfig,
} from "./config.js";
export { discoverRoutes, type FileRoute, type FileRouterOptions } from "./file-router.js";
export {
  isRouteFile,
  resolveRoutePath,
  type ConvertFsPathToRoutePath,
  type ParseFilesystemRouteParams,
} from "./filesystem-router.js";
export {
  type ApplicationContext,
  type ApplicationContextOptions,
  createApplicationContext,
  type LoadApplicationContextOptions,
  loadApplicationContext,
  type RouteContext,
  type FileRouteHandler,
  type FilesystemRouteHandler,
  defineRouteHandler,
} from "./context.js";
export {
  defineRoute,
  isRouteDefinition,
  type RouteOptions,
  type RouteDefinition,
  type ValidateOptions,
  type InferValidationTarget,
  type InferValidateParams,
  type InferValidateQuery,
  type InferValidateHeaders,
  type InferValidateBody,
} from "./route-definition.js";

export {
  createSchema,
  isForgeSchema,
  executeSchemaValidation,
  ForgeValidationError,
  ResponseValidationError,
  type ForgeSchema,
  type SchemaResult,
  type SchemaValidationError,
  type SchemaIssue,
  type ValidationIssue,
  type ValidationSource,
  type InferSchemaOutput,
} from "./schema.js";

export {
  scanRouteFiles,
  type DiscoveredRouteFile,
  type RouteScannerOptions,
} from "./route-scanner.js";
export { loadRouteModule, loadRouteModules, type LoadedRouteModule } from "./route-loader.js";
export { registerLoadedRoutes } from "./route-registrar.js";

export {
  BUILD_OUTPUT_DIR,
  BUILD_STAGING_DIR,
  BUILD_FORMAT_VERSION,
  type BuildMetadata,
  type BuildRouteEntry,
  type BuildManifest,
  BuildOutputManager,
  getBuildDir,
  getStagingBuildDir,
  getManifestPath,
  toPosixPath,
  mapSourceToBuildPath,
  validateBuildManifest,
  formatBuildManifest,
  parseBuildManifest,
} from "./build.js";

export {
  compileTypeScriptProject,
  TypeScriptCompileError,
  type CompileOptions,
  type CompileResult,
} from "./compiler.js";

export {
  processJavaScriptProject,
  JavaScriptBuildError,
  detectProjectLanguage,
  type JavaScriptBuildOptions,
  type JavaScriptBuildResult,
} from "./js-builder.js";

export {
  loadProductionBuildConfig,
  BuildConfigError,
  type ProductionBuildConfig,
} from "./build-config.js";

export { discoverBuildRouteEntries, type DiscoverBuildRoutesOptions } from "./build-routes.js";

export {
  generateBuildManifest,
  ManifestGenerationError,
  type GenerateManifestOptions,
} from "./build-manifest.js";

export {
  BuildOrchestrator,
  ArtifactValidationError,
  buildProject,
  validateStagingArtifact,
  type BuildOptions,
  type BuildResult,
} from "./build-orchestrator.js";

export {
  startProductionServer,
  loadProductionApplication,
  ProductionArtifactError,
  type ProductionRunnerOptions,
  type ProductionRunnerResult,
} from "./production-runner.js";
