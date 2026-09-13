import type { RouteHandler } from "./application.js";

type SegmentType = "static" | "param" | "wildcard";

interface Segment {
  type: SegmentType;
  value: string;
  name?: string;
}

export interface RouteMatch {
  handler: RouteHandler;
  params: Record<string, string>;
}

interface InternalRoute {
  method: string;
  path: string;
  handler: RouteHandler;
  segments: Segment[];
  score: number;
}

function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  let cleaned = path;
  if (cleaned.endsWith("/") && cleaned.length > 1) {
    cleaned = cleaned.slice(0, -1);
  }
  if (!cleaned.startsWith("/")) {
    cleaned = `/${cleaned}`;
  }
  return cleaned;
}

function parsePathSegments(path: string): { segments: Segment[]; score: number } {
  const normalized = normalizePath(path);
  const rawSegments = normalized === "/" ? [] : normalized.split("/").slice(1);
  const segments: Segment[] = [];
  let score = 0;

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    if (seg === "*") {
      segments.push({ type: "wildcard", value: "*", name: "*" });
      score = score * 10 + 1;
      break;
    } else if (seg.startsWith("*")) {
      const paramName = seg.slice(1) || "*";
      segments.push({ type: "wildcard", value: seg, name: paramName });
      score = score * 10 + 1;
      break;
    } else if (seg.startsWith(":")) {
      const paramName = seg.slice(1);
      segments.push({ type: "param", value: seg, name: paramName });
      score = score * 10 + 2;
    } else {
      segments.push({ type: "static", value: seg });
      score = score * 10 + 3;
    }
  }

  return { segments, score };
}

export class Router {
  private readonly routes: InternalRoute[] = [];

  add(method: string, path: string, handler: RouteHandler): void {
    if (!method.trim()) {
      throw new Error("Route method cannot be empty");
    }

    if (!path.trim()) {
      throw new Error("Route path cannot be empty");
    }

    if (typeof handler !== "function") {
      throw new Error("Route handler must be a function");
    }

    const uppercaseMethod = method.toUpperCase();
    const { segments, score } = parsePathSegments(path);

    const existingIndex = this.routes.findIndex(
      (route) => route.method === uppercaseMethod && route.path === normalizePath(path),
    );

    if (existingIndex !== -1) {
      this.routes.splice(existingIndex, 1);
    }

    this.routes.push({
      method: uppercaseMethod,
      path: normalizePath(path),
      handler,
      segments,
      score,
    });

    // Sort routes by score descending so static > dynamic > wildcard precedence is automatic
    this.routes.sort((a, b) => b.score - a.score);
  }

  find(method: string, pathname: string): RouteMatch | null {
    const uppercaseMethod = method.toUpperCase();

    const methods = uppercaseMethod === "HEAD" ? ["HEAD", "GET"] : [uppercaseMethod];

    const normalized = normalizePath(pathname);
    const reqSegments = normalized === "/" ? [] : normalized.split("/").slice(1);

    for (const lookupMethod of methods) {
      for (const route of this.routes) {
        if (route.method !== lookupMethod) {
          continue;
        }

        const params: Record<string, string> = {};
        let isMatch = true;

        for (let i = 0; i < route.segments.length; i++) {
          const seg = route.segments[i];

          if (seg.type === "wildcard") {
            const restPath = reqSegments.slice(i).join("/");
            try {
              params[seg.name ?? "*"] = decodeURIComponent(restPath);
            } catch {
              params[seg.name ?? "*"] = restPath;
            }
            break;
          }

          if (i >= reqSegments.length) {
            isMatch = false;
            break;
          }

          const reqSeg = reqSegments[i];

          if (seg.type === "static") {
            if (seg.value !== reqSeg) {
              isMatch = false;
              break;
            }
          } else if (seg.type === "param") {
            try {
              params[seg.name!] = decodeURIComponent(reqSeg);
            } catch {
              params[seg.name!] = reqSeg;
            }
          }
        }

        // Check for length match if no wildcard
        const lastSeg = route.segments[route.segments.length - 1];
        const hasWildcard = lastSeg && lastSeg.type === "wildcard";

        if (isMatch && !hasWildcard && route.segments.length !== reqSegments.length) {
          isMatch = false;
        }

        if (isMatch) {
          return {
            handler: route.handler,
            params,
          };
        }
      }
    }

    return null;
  }

  hasPath(pathname: string): boolean {
    const normalized = normalizePath(pathname);
    const reqSegments = normalized === "/" ? [] : normalized.split("/").slice(1);

    return this.routes.some((route) => {
      if (route.segments.length > reqSegments.length) {
        const last = route.segments[route.segments.length - 1];

        if (last?.type !== "wildcard") {
          return false;
        }
      }

      for (let i = 0; i < route.segments.length; i++) {
        const segment = route.segments[i];

        if (segment.type === "wildcard") {
          return true;
        }

        if (i >= reqSegments.length) {
          return false;
        }

        if (segment.type === "static" && segment.value !== reqSegments[i]) {
          return false;
        }
      }

      return route.segments.length === reqSegments.length;
    });
  }
}
