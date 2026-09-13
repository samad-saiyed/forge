import * as path from "node:path";
import type { ParseRouteParams } from "./application.js";

export type ConvertFsPathToRoutePath<S extends string> = S extends `${infer Prefix}/route.${string}`
  ? ConvertFsPathToRoutePath<Prefix>
  : S extends `route.${string}`
    ? "/"
    : S extends `${infer Head}/[...${infer Param}]/${infer Tail}`
      ? ConvertFsPathToRoutePath<`${Head}/*${Param}/${Tail}`>
      : S extends `${infer Head}/[...${infer Param}]`
        ? `${Head}/*${Param}`
        : S extends `[...${infer Param}]/${infer Tail}`
          ? ConvertFsPathToRoutePath<`*${Param}/${Tail}`>
          : S extends `[...${infer Param}]`
            ? `*${Param}`
            : S extends `${infer Head}/[${infer Param}]/${infer Tail}`
              ? ConvertFsPathToRoutePath<`${Head}/:${Param}/${Tail}`>
              : S extends `${infer Head}/[${infer Param}]`
                ? `${Head}/:${Param}`
                : S extends `[${infer Param}]/${infer Tail}`
                  ? ConvertFsPathToRoutePath<`:${Param}/${Tail}`>
                  : S extends `[${infer Param}]`
                    ? `:${Param}`
                    : S;

export type ParseFilesystemRouteParams<Path extends string> = string extends Path
  ? Record<string, string>
  : ParseRouteParams<ConvertFsPathToRoutePath<Path>>;

const VALID_PARAM_NAME_REGEX = /^[a-zA-Z0-9_]+$/;

export function isRouteFile(filePath: string): boolean {
  if (!filePath) {
    return false;
  }
  const basename = path.basename(filePath);
  return basename === "route.ts";
}

function convertAndValidateSegment(segment: string, filePath: string): string {
  if (segment.startsWith("[") || segment.endsWith("]")) {
    if (segment.startsWith("[...") && segment.endsWith("]")) {
      const paramName = segment.slice(4, -1);
      if (VALID_PARAM_NAME_REGEX.test(paramName)) {
        return `*${paramName}`;
      }
    } else if (segment.startsWith("[") && segment.endsWith("]")) {
      const paramName = segment.slice(1, -1);
      if (VALID_PARAM_NAME_REGEX.test(paramName)) {
        return `:${paramName}`;
      }
    }

    throw new Error(
      `Invalid dynamic route segment "${segment}" in path "${filePath}". Dynamic segment syntax must be [paramName] or [...paramName] with valid identifier characters.`,
    );
  }

  return segment;
}

export function resolveRoutePath(filePath: string, appRoot?: string): string | null {
  if (!isRouteFile(filePath)) {
    return null;
  }

  const normalizedFilePath = filePath.replace(/\\/g, "/");

  let relativePath = normalizedFilePath;
  if (appRoot) {
    const normalizedRoot = appRoot.replace(/\\/g, "/").replace(/\/$/, "");
    if (normalizedFilePath.startsWith(normalizedRoot)) {
      relativePath = normalizedFilePath.slice(normalizedRoot.length);
    } else {
      relativePath = path.relative(appRoot, filePath).replace(/\\/g, "/");
    }
  }

  let dirPath = relativePath;
  if (dirPath.endsWith("/route.ts")) {
    dirPath = dirPath.slice(0, -9);
  } else if (dirPath === "route.ts") {
    dirPath = "";
  }

  dirPath = dirPath.replace(/^\/?(src\/)?app(\/|$)/, "");
  dirPath = dirPath.replace(/^\/+/, "");

  if (!dirPath || dirPath === "." || dirPath === "") {
    return "/";
  }

  const segments = dirPath.split("/").filter(Boolean);
  const convertedSegments = segments.map((seg) => convertAndValidateSegment(seg, filePath));

  return "/" + convertedSegments.join("/");
}
