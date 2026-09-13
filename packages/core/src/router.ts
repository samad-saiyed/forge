import type { Middleware, RouteHandler } from "./application.js";

type SegmentType = "static" | "param" | "wildcard";

interface Segment {
  type: SegmentType;
  value: string;
  name?: string;
}

export interface RouteMatch<Params extends Record<string, string> = Record<string, string>> {
  handler: RouteHandler<Params>;
  middlewares?: Middleware<Params>[];
  params: Params;
  order?: number;
}

interface DynamicNode {
  staticChildren?: Map<string, DynamicNode>;
  paramChild?: {
    paramName: string;
    node: DynamicNode;
  };
  wildcardChild?: {
    paramName: string;
    handler: RouteHandler;
    middlewares?: Middleware[];
    order?: number;
  };
  handler?: RouteHandler;
  middlewares?: Middleware[];
  order?: number;
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

function parsePathSegments(path: string): Segment[] {
  const normalized = normalizePath(path);
  const rawSegments = normalized === "/" ? [] : normalized.split("/").slice(1);
  const segments: Segment[] = [];

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    if (seg === "*") {
      segments.push({ type: "wildcard", value: "*", name: "*" });
      break;
    } else if (seg.startsWith("*")) {
      const paramName = seg.slice(1) || "*";
      segments.push({ type: "wildcard", value: seg, name: paramName });
      break;
    } else if (seg.startsWith(":")) {
      const paramName = seg.slice(1);
      segments.push({ type: "param", value: seg, name: paramName });
    } else {
      segments.push({ type: "static", value: seg });
    }
  }

  return segments;
}

function insertDynamicRoute(
  root: DynamicNode,
  segments: Segment[],
  handler: RouteHandler,
  middlewares?: Middleware[],
  order?: number,
): void {
  let curr = root;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg.type === "static") {
      if (!curr.staticChildren) {
        curr.staticChildren = new Map<string, DynamicNode>();
      }
      let nextNode = curr.staticChildren.get(seg.value);
      if (!nextNode) {
        nextNode = {};
        curr.staticChildren.set(seg.value, nextNode);
      }
      curr = nextNode;
    } else if (seg.type === "param") {
      const paramName = seg.name!;
      if (!curr.paramChild) {
        curr.paramChild = {
          paramName,
          node: {},
        };
      } else {
        curr.paramChild.paramName = paramName;
      }
      curr = curr.paramChild.node;
    } else if (seg.type === "wildcard") {
      const paramName = seg.name ?? "*";
      curr.wildcardChild = {
        paramName,
        handler,
        middlewares,
        order,
      };
      return;
    }
  }

  curr.handler = handler;
  curr.middlewares = middlewares;
  curr.order = order;
}

function searchDynamicTree<Params extends Record<string, string> = Record<string, string>>(
  node: DynamicNode,
  segments: string[],
  index: number,
  params: Record<string, string>,
): RouteMatch<Params> | null {
  if (index === segments.length) {
    if (node.handler) {
      return {
        handler: node.handler as RouteHandler<Params>,
        middlewares: node.middlewares as Middleware<Params>[] | undefined,
        params: { ...params } as Params,
        order: node.order,
      };
    }
    if (node.wildcardChild) {
      const paramName = node.wildcardChild.paramName;
      const finalParams = { ...params };
      finalParams[paramName] = "";
      return {
        handler: node.wildcardChild.handler as RouteHandler<Params>,
        middlewares: node.wildcardChild.middlewares as Middleware<Params>[] | undefined,
        params: finalParams as Params,
        order: node.wildcardChild.order,
      };
    }
    return null;
  }

  const seg = segments[index];

  // 1. Static branch precedence
  if (node.staticChildren?.has(seg)) {
    const staticChild = node.staticChildren.get(seg)!;
    const result = searchDynamicTree<Params>(staticChild, segments, index + 1, params);
    if (result) return result;
  }

  // 2. Param branch precedence
  if (node.paramChild) {
    const { paramName, node: paramNode } = node.paramChild;
    let decodedValue = seg;
    try {
      decodedValue = decodeURIComponent(seg);
    } catch {
      decodedValue = seg;
    }
    params[paramName] = decodedValue;
    const result = searchDynamicTree<Params>(paramNode, segments, index + 1, params);
    if (result) return result;
    delete params[paramName];
  }

  // 3. Wildcard branch precedence
  if (node.wildcardChild) {
    const { paramName, handler, middlewares, order } = node.wildcardChild;
    const restPath = segments.slice(index).join("/");
    let decodedRest = restPath;
    try {
      decodedRest = decodeURIComponent(restPath);
    } catch {
      decodedRest = restPath;
    }
    const finalParams = { ...params };
    finalParams[paramName] = decodedRest;
    return {
      handler: handler as RouteHandler<Params>,
      middlewares: middlewares as Middleware<Params>[] | undefined,
      params: finalParams as Params,
      order,
    };
  }

  return null;
}

function hasPathInDynamicTree(node: DynamicNode, segments: string[], index: number): boolean {
  if (index === segments.length) {
    return Boolean(node.handler || node.wildcardChild);
  }

  const seg = segments[index];

  if (node.staticChildren?.has(seg)) {
    if (hasPathInDynamicTree(node.staticChildren.get(seg)!, segments, index + 1)) {
      return true;
    }
  }

  if (node.paramChild) {
    if (hasPathInDynamicTree(node.paramChild.node, segments, index + 1)) {
      return true;
    }
  }

  if (node.wildcardChild) {
    return true;
  }

  return false;
}

interface RouteEntry {
  handler: RouteHandler;
  middlewares?: Middleware[];
  order?: number;
}

function getCanonicalRouteKey(method: string, path: string): string {
  const uppercaseMethod = method.toUpperCase();
  const segments = parsePathSegments(path);
  const canonicalSegments = segments.map((seg) => {
    if (seg.type === "static") return seg.value;
    if (seg.type === "param") return ":_param_";
    return "*_wildcard_";
  });
  return `${uppercaseMethod} /${canonicalSegments.join("/")}`;
}

export class Router {
  private readonly staticRoutes = new Map<string, Map<string, RouteEntry>>();
  private readonly dynamicTrees = new Map<string, DynamicNode>();
  private readonly registeredRoutes = new Map<string, string>();
  private readonly canonicalRegisteredRoutes = new Map<string, string>();

  add(
    method: string,
    path: string,
    handler: RouteHandler,
    middlewares?: Middleware[],
    order?: number,
    source?: string,
  ): void {
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
    const normalizedPath = normalizePath(path);
    const exactRouteKey = `${uppercaseMethod} ${normalizedPath}`;
    const canonicalRouteKey = getCanonicalRouteKey(uppercaseMethod, path);

    const currentSource = source ?? "programmatic";
    const isCurrentProgrammatic = currentSource === "programmatic";

    const exactExistingSource = this.registeredRoutes.get(exactRouteKey);
    if (exactExistingSource !== undefined) {
      const isExistingProgrammatic = exactExistingSource === "programmatic";

      if (isExistingProgrammatic && isCurrentProgrammatic) {
        throw new Error(
          `Duplicate route registration: ${uppercaseMethod} ${normalizedPath} (already registered from ${exactExistingSource}, attempted from ${currentSource})`,
        );
      }
    }

    const canonicalExistingSource = this.canonicalRegisteredRoutes.get(canonicalRouteKey);
    if (canonicalExistingSource !== undefined) {
      const isExistingProgrammatic = canonicalExistingSource === "programmatic";

      if (!isExistingProgrammatic && !isCurrentProgrammatic) {
        throw new Error(
          `Ambiguous filesystem route collision: ${uppercaseMethod} ${normalizedPath} (defined in both "${canonicalExistingSource}" and "${currentSource}")`,
        );
      }

      if (isExistingProgrammatic && !isCurrentProgrammatic) {
        // Programmatic route takes precedence over filesystem route
        return;
      }
    }

    this.registeredRoutes.set(exactRouteKey, currentSource);
    this.canonicalRegisteredRoutes.set(canonicalRouteKey, currentSource);

    const segments = parsePathSegments(path);

    const isStatic = segments.every((seg) => seg.type === "static");

    if (isStatic) {
      let methodMap = this.staticRoutes.get(uppercaseMethod);
      if (!methodMap) {
        methodMap = new Map<string, RouteEntry>();
        this.staticRoutes.set(uppercaseMethod, methodMap);
      }
      methodMap.set(normalizedPath, { handler, middlewares, order });
    } else {
      const staticMap = this.staticRoutes.get(uppercaseMethod);
      if (staticMap) {
        staticMap.delete(normalizedPath);
      }

      let tree = this.dynamicTrees.get(uppercaseMethod);
      if (!tree) {
        tree = {};
        this.dynamicTrees.set(uppercaseMethod, tree);
      }

      insertDynamicRoute(tree, segments, handler, middlewares, order);
    }
  }

  find<Params extends Record<string, string> = Record<string, string>>(
    method: string,
    pathname: string,
  ): RouteMatch<Params> | null {
    const uppercaseMethod = method.toUpperCase();
    const isHead = uppercaseMethod === "HEAD";

    const qIdx = pathname.indexOf("?");
    const pathOnly = qIdx === -1 ? pathname : pathname.slice(0, qIdx);
    const normalized = normalizePath(pathOnly);

    if (isHead) {
      const headMap = this.staticRoutes.get("HEAD");
      if (headMap?.has(normalized)) {
        const entry = headMap.get(normalized)!;
        return {
          handler: entry.handler as RouteHandler<Params>,
          middlewares: entry.middlewares as Middleware<Params>[] | undefined,
          params: {} as Params,
          order: entry.order,
        };
      }
      const getMap = this.staticRoutes.get("GET");
      if (getMap?.has(normalized)) {
        const entry = getMap.get(normalized)!;
        return {
          handler: entry.handler as RouteHandler<Params>,
          middlewares: entry.middlewares as Middleware<Params>[] | undefined,
          params: {} as Params,
          order: entry.order,
        };
      }
    } else {
      const methodMap = this.staticRoutes.get(uppercaseMethod);
      if (methodMap?.has(normalized)) {
        const entry = methodMap.get(normalized)!;
        return {
          handler: entry.handler as RouteHandler<Params>,
          middlewares: entry.middlewares as Middleware<Params>[] | undefined,
          params: {} as Params,
          order: entry.order,
        };
      }
    }

    const methodsToScan = isHead ? ["HEAD", "GET"] : [uppercaseMethod];
    const reqSegments = normalized === "/" ? [] : normalized.split("/").slice(1);

    for (const candidateMethod of methodsToScan) {
      const tree = this.dynamicTrees.get(candidateMethod);
      if (!tree) continue;

      const params: Record<string, string> = {};
      const match = searchDynamicTree<Params>(tree, reqSegments, 0, params);
      if (match) {
        return match;
      }
    }

    return null;
  }

  hasPath(pathname: string): boolean {
    const qIdx = pathname.indexOf("?");
    const pathOnly = qIdx === -1 ? pathname : pathname.slice(0, qIdx);
    const normalized = normalizePath(pathOnly);

    for (const methodMap of this.staticRoutes.values()) {
      if (methodMap.has(normalized)) {
        return true;
      }
    }

    const reqSegments = normalized === "/" ? [] : normalized.split("/").slice(1);

    for (const tree of this.dynamicTrees.values()) {
      if (hasPathInDynamicTree(tree, reqSegments, 0)) {
        return true;
      }
    }

    return false;
  }
}
