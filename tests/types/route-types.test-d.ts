import {
  Application,
  createApp,
  Request,
  Response,
  type Middleware,
  type ParseRouteParams,
  type RouteContext,
  type RouteHandler,
} from "../../packages/core/src/index.js";

type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;

// 1. Parameter extraction type tests
type SingleParam = ParseRouteParams<"/users/:id">;
export const checkSingle: AssertEqual<SingleParam, { id: string }> = true;

type MultiParam = ParseRouteParams<"/users/:userId/posts/:postId">;
export const checkMulti: AssertEqual<MultiParam, { userId: string; postId: string }> = true;

type StaticRoute = ParseRouteParams<"/users">;
export const checkStatic: AssertEqual<StaticRoute, Record<string, never>> = true;

type WildcardRoute = ParseRouteParams<"/files/*filepath">;
export const checkWildcard: AssertEqual<WildcardRoute, { filepath: string }> = true;

type GenericStringRoute = ParseRouteParams<string>;
export const checkGeneric: AssertEqual<GenericStringRoute, Record<string, string>> = true;

// 2. Application route handler inference tests
const app = createApp();

app.get("/users/:id", (req) => {
  const id: string = req.params.id;
  void id;
  // @ts-expect-error invalid property access should fail on typed params
  const invalid = req.params.invalid;
  void invalid;
});

app.post("/users/:userId/posts/:postId", (req) => {
  const userId: string = req.params.userId;
  const postId: string = req.params.postId;
  void userId;
  void postId;
  // @ts-expect-error invalid property access
  const invalid = req.params.other;
  void invalid;
});

app.put("/static/route", (req) => {
  void req;
  type ParamsType = typeof req.params;
  const checkStaticParams: AssertEqual<ParamsType, Record<string, never>> = true;
  void checkStaticParams;
});

// 3. Existing middleware compatibility test
const logger: Middleware = (_req, _res, next) => {
  void next();
};

app.use(logger);

app.get("/users/:id", logger, (req) => {
  const id: string = req.params.id;
  void id;
});

// 4. Path-scoped middleware parameter inference tests
app.use("/users/:id", (req, _res, next) => {
  const id: string = req.params.id;
  void id;
  // @ts-expect-error invalid property access
  const invalid = req.params.invalid;
  void invalid;
  void next();
});

app.use("/users/:userId/posts/:postId", (req, _res, next) => {
  const userId: string = req.params.userId;
  const postId: string = req.params.postId;
  void userId;
  void postId;
  // @ts-expect-error invalid property access
  const invalid = req.params.other;
  void invalid;
  void next();
});

// Global middleware continues using generic fallback Record<string, string>
app.use((req, _res, next) => {
  type ParamsType = typeof req.params;
  const checkGlobalParams: AssertEqual<ParamsType, Record<string, string>> = true;
  void checkGlobalParams;
  void next();
});

// 5. Typed query parameter tests
app.get<unknown, unknown, { search: string; page?: string }>("/users", (req) => {
  const search: string = req.query.search;
  const page: string | undefined = req.query.page;
  void search;
  void page;

  // @ts-expect-error invalid property access on typed query
  const invalid = req.query.invalid;
  void invalid;
});

app.get<unknown, unknown, { search: string }, "/users/:id">("/users/:id", (req) => {
  const id: string = req.params.id;
  const search: string = req.query.search;
  void id;
  void search;
  // @ts-expect-error invalid property access on params
  const invalidParam = req.params.invalid;
  void invalidParam;
  // @ts-expect-error invalid property access on query
  const invalidQuery = req.query.invalid;
  void invalidQuery;
});

// 6. RouteContext type tests
type TestUserCtx = RouteContext<
  { id: string },
  { search?: string },
  { name: string },
  { id: string; name: string }
>;

export const checkCtxReq: AssertEqual<
  TestUserCtx["request"],
  Request<{ id: string }, { search?: string }, { name: string }>
> = true;
export const checkCtxRes: AssertEqual<
  TestUserCtx["response"],
  Response<{ id: string; name: string }>
> = true;
export const checkCtxApp: AssertEqual<TestUserCtx["app"], Application> = true;

// Verify RouteHandler usability with RouteContext
type HandlerFromCtx = RouteHandler<TestUserCtx>;
type DirectHandler = RouteHandler<
  { id: string },
  { search?: string },
  { name: string },
  { id: string; name: string }
>;

export const checkRouteHandlerFromCtx: AssertEqual<HandlerFromCtx, DirectHandler> = true;

// 7. Typed body tests
type UserPayload = { name: string; age?: number };

app.post<unknown, UserPayload>("/users", async (req) => {
  const body = await req.body;
  const name: string = body.name;
  const age: number | undefined = body.age;
  void name;
  void age;
  // @ts-expect-error invalid property access on typed body
  const invalid = body.invalid;
  void invalid;
});

app.post<unknown, UserPayload, { search?: string }, "/users/:id">("/users/:id", async (req) => {
  const id: string = req.params.id;
  const search: string | undefined = req.query.search;
  const body = await req.body;
  const name: string = body.name;
  void id;
  void search;
  void name;
});

// 8. Typed response tests
type UserResponse = { id: string; name: string };

app.get<UserResponse>("/users/:id", async (req, res) => {
  // Valid res.json
  res.json({ id: req.params.id, name: "Samad" });

  // Valid status chainability
  res.status(200).json({ id: req.params.id, name: "Samad" });

  // @ts-expect-error invalid property type on res.json
  res.json({ id: req.params.id, name: 123 });

  // @ts-expect-error missing required field on res.json
  res.json({ id: req.params.id });

  // @ts-expect-error invalid property type in chained call
  res.status(200).json({ id: 123, name: "Samad" });
});

// Untyped response usage allows any json payload
app.get("/untyped-users/:id", (req, res) => {
  res.json({ id: req.params.id, name: "Samad", extra: true });
  res.status(200).json("text");
});

// 9. FileRoute type compatibility test
import { type FileRoute, discoverRoutes } from "../../packages/core/src/index.js";

const sampleFileRoute: FileRoute = {
  method: "GET",
  path: "/users/:id",
  handler: (req, res, next) => {
    void req;
    void res;
    void next();
  },
  filePath: "/src/app/users/[id]/route.ts",
};

export const checkFileRouteHandler: AssertEqual<
  typeof sampleFileRoute.handler,
  RouteHandler | FileRouteHandler
> = true;
void sampleFileRoute;
void discoverRoutes;

// 10. RouteContext and FileRouteHandler type tests
import {
  type ApplicationContext,
  type FileRouteHandler,
  type RouteContext as AppRouteContext,
} from "../../packages/core/src/index.js";

const sampleFileHandler: FileRouteHandler<{ id: string }> = async ({ app, request, response }) => {
  void app;
  const id: string = request.params.id;
  void id;
  // @ts-expect-error invalid property access on params
  const invalid = request.params.invalid;
  void invalid;
  response.status(200);
};

export const checkAppContext: AssertEqual<
  AppRouteContext<{ id: string }>,
  {
    app: Application;
    request: Request<{ id: string }>;
    response: Response<unknown>;
  }
> = true;

export const checkApplicationContext: AssertEqual<
  ApplicationContext,
  {
    app: Application;
  }
> = true;

void sampleFileHandler;

// 11. Action 53: Filesystem route parameter inference tests
import {
  defineRouteHandler,
  type ConvertFsPathToRoutePath,
  type FilesystemRouteHandler,
  type ParseFilesystemRouteParams,
} from "../../packages/core/src/index.js";

// Type-level path conversion tests
type FsSingleConvert = ConvertFsPathToRoutePath<"src/app/users/[id]/route.ts">;
export const checkFsSingleConvert: AssertEqual<FsSingleConvert, "src/app/users/:id"> = true;

type FsMultiConvert = ConvertFsPathToRoutePath<"users/[userId]/posts/[postId]/route.ts">;
export const checkFsMultiConvert: AssertEqual<FsMultiConvert, "users/:userId/posts/:postId"> = true;

type FsWildcardConvert = ConvertFsPathToRoutePath<"files/[...path]/route.ts">;
export const checkFsWildcardConvert: AssertEqual<FsWildcardConvert, "files/*path"> = true;

// Type-level parameter extraction tests
type FsSingleParams = ParseFilesystemRouteParams<"src/app/users/[id]/route.ts">;
export const checkFsSingleParams: AssertEqual<FsSingleParams, { id: string }> = true;

type FsMultiParams = ParseFilesystemRouteParams<"users/[userId]/posts/[postId]/route.ts">;
export const checkFsMultiParams: AssertEqual<FsMultiParams, { userId: string; postId: string }> =
  true;

type FsWildcardParams = ParseFilesystemRouteParams<"files/[...path]/route.ts">;
export const checkFsWildcardParams: AssertEqual<FsWildcardParams, { path: string }> = true;

type FsStaticParams = ParseFilesystemRouteParams<"users/route.ts">;
export const checkFsStaticParams: AssertEqual<FsStaticParams, Record<string, never>> = true;

type FsGenericParams = ParseFilesystemRouteParams<string>;
export const checkFsGenericParams: AssertEqual<FsGenericParams, Record<string, string>> = true;

// Filesystem handler parameter inference tests with defineRouteHandler & FilesystemRouteHandler
export const fsGetHandler = defineRouteHandler<"users/[id]">((({ request, response }) => {
  const id: string = request.params.id;
  void id;
  // @ts-expect-error invalid property access should fail on typed params
  const invalid = request.params.userId;
  void invalid;
  response.status(200);
}) as FilesystemRouteHandler<"users/[id]">);

export const fsPostHandler = defineRouteHandler<"users/[userId]/posts/[postId]">((({ request }) => {
  const userId: string = request.params.userId;
  const postId: string = request.params.postId;
  void userId;
  void postId;
  // @ts-expect-error invalid property access should fail on typed params
  const invalid = request.params.invalid;
  void invalid;
}) as FilesystemRouteHandler<"users/[userId]/posts/[postId]">);

export const fsWildcardHandler = defineRouteHandler<"files/[...path]">((({ request }) => {
  const pathVal: string = request.params.path;
  void pathVal;
  // @ts-expect-error invalid property access
  const invalid = request.params.other;
  void invalid;
}) as FilesystemRouteHandler<"files/[...path]">);

export const fsStaticHandler = defineRouteHandler<"users/route.ts">((({ request }) => {
  void request;
  type ParamsType = typeof request.params;
  const checkStaticFsParams: AssertEqual<ParamsType, Record<string, never>> = true;
  void checkStaticFsParams;
}) as FilesystemRouteHandler<"users/route.ts">);

// Multi-method route module inference check (GET, POST, PUT, DELETE sharing route path)
type UserRoutePath = "users/[id]";
export const multiMethodGet: FilesystemRouteHandler<UserRoutePath> = ({ request }) => {
  const id: string = request.params.id;
  void id;
};

export const multiMethodPost: FilesystemRouteHandler<UserRoutePath> = ({ request }) => {
  const id: string = request.params.id;
  void id;
};

export const multiMethodPut: FilesystemRouteHandler<UserRoutePath> = ({ request }) => {
  const id: string = request.params.id;
  void id;
};

export const multiMethodDelete: FilesystemRouteHandler<UserRoutePath> = ({ request }) => {
  const id: string = request.params.id;
  void id;
};

// 12. Action 54: Typed Query Parameter tests
type BasicQueryReq = Request<Record<string, never>, { page?: string }>;
const basicQueryReq = {} as BasicQueryReq;
const pageVal: string | undefined = basicQueryReq.query.page;
void pageVal;
// @ts-expect-error invalid property access on query
const invalidBasicQuery = basicQueryReq.query.limit;
void invalidBasicQuery;

type RequiredQueryReq = Request<Record<string, never>, { id: string }>;
const reqQueryReq = {} as RequiredQueryReq;
const idQueryVal: string = reqQueryReq.query.id;
void idQueryVal;

type OptionalQueryReq = Request<Record<string, never>, { search?: string }>;
const optQueryReq = {} as OptionalQueryReq;
const searchVal: string | undefined = optQueryReq.query.search;
void searchVal;

// Independent Params + Query type test
type CombinedReq = Request<{ id: string }, { page?: string }>;
const combinedReq = {} as CombinedReq;
const combinedId: string = combinedReq.params.id;
const combinedPage: string | undefined = combinedReq.query.page;
void combinedId;
void combinedPage;
// @ts-expect-error invalid param property access
const invalidCombinedParam = combinedReq.params.invalid;
void invalidCombinedParam;
// @ts-expect-error invalid query property access
const invalidCombinedQuery = combinedReq.query.invalid;
void invalidCombinedQuery;

// Filesystem handler with typed query parameters
export const fsTypedQueryHandler = defineRouteHandler<
  "users/[id]",
  { page?: string; search?: string }
>(({ request }) => {
  const id: string = request.params.id;
  const page: string | undefined = request.query.page;
  const search: string | undefined = request.query.search;
  void id;
  void page;
  void search;

  // @ts-expect-error invalid param property access
  const invalidParam = request.params.invalid;
  void invalidParam;

  // @ts-expect-error invalid query property access
  const invalidQuery = request.query.invalid;
  void invalidQuery;
});

// 13. Action 55: Typed Request Body tests
type BasicBodyPayload = { name: string; email: string };
type BasicBodyReq = Request<
  Record<string, never>,
  Record<string, string | string[]>,
  BasicBodyPayload
>;

const testBasicBody = async (req: BasicBodyReq) => {
  const body = await req.body;
  const name: string = body.name;
  const email: string = body.email;
  void name;
  void email;
  // @ts-expect-error invalid property access on typed body
  const invalid = body.invalid;
  void invalid;
};
void testBasicBody;

type NestedBodyPayload = { user: { name: string } };
type NestedBodyReq = Request<
  Record<string, never>,
  Record<string, string | string[]>,
  NestedBodyPayload
>;

const testNestedBody = async (req: NestedBodyReq) => {
  const body = await req.body;
  const userName: string = body.user.name;
  void userName;
  // @ts-expect-error invalid property access on nested body
  const invalid = body.user.invalid;
  void invalid;
};
void testNestedBody;

type OptionalBodyPayload = { name: string; nickname?: string };
type OptionalBodyReq = Request<
  Record<string, never>,
  Record<string, string | string[]>,
  OptionalBodyPayload
>;

const testOptionalBody = async (req: OptionalBodyReq) => {
  const body = await req.body;
  const nickname: string | undefined = body.nickname;
  void nickname;
};
void testOptionalBody;

// Simultaneous Params + Query + Body independent type test
type FullTypedReq = Request<
  { id: string },
  { includePosts?: string },
  { name: string; email: string }
>;

const testFullTypedReq = async (req: FullTypedReq) => {
  const id: string = req.params.id;
  const includePosts: string | undefined = req.query.includePosts;
  const body = await req.body;
  const name: string = body.name;
  const email: string = body.email;
  void id;
  void includePosts;
  void name;
  void email;

  // @ts-expect-error invalid param property access
  const invalidParam = req.params.invalid;
  void invalidParam;

  // @ts-expect-error invalid query property access
  const invalidQuery = req.query.invalid;
  void invalidQuery;

  // @ts-expect-error invalid body property access
  const invalidBody = body.invalid;
  void invalidBody;
};
void testFullTypedReq;

// Filesystem handler with typed body
export const fsTypedBodyHandler = defineRouteHandler<
  "users/[id]",
  { search?: string },
  { name: string; email: string }
>(async ({ request, response }) => {
  const id: string = request.params.id;
  const search: string | undefined = request.query.search;
  const body = await request.body;
  const name: string = body.name;
  const email: string = body.email;
  void id;
  void search;
  void name;
  void email;

  // @ts-expect-error invalid param access
  const invalidParam = request.params.invalid;
  void invalidParam;

  // @ts-expect-error invalid query access
  const invalidQuery = request.query.invalid;
  void invalidQuery;

  // @ts-expect-error invalid body access
  const invalidBody = body.invalid;
  void invalidBody;

  response.status(200);
});

// 14. Action 56: Typed Response API tests
type Action56UserResponse = { id: string; name: string };

// Basic untyped response allows any json payload
app.get("/action56/untyped/:id", (_req, res) => {
  res.json({ anything: true });
  res.status(200).json("arbitrary string");
});

// Typed JSON response validation
app.get<Action56UserResponse>("/action56/typed/:id", (req, res) => {
  // Valid res.json
  res.json({ id: req.params.id, name: "Alice" });

  // Valid chained status + json
  res.status(201).json({ id: req.params.id, name: "Bob" });

  // Valid send & end on typed response instance
  res.send("HTML content");
  res.send(Buffer.from("binary content"));
  res.status(204).end();

  // @ts-expect-error invalid field type in res.json
  res.json({ id: req.params.id, name: 123 });

  // @ts-expect-error missing required field in res.json
  res.json({ id: req.params.id });

  // @ts-expect-error invalid property type in chained status call
  res.status(200).json({ id: 123, name: "Alice" });
});

// Params + Response independent typing
app.get<Action56UserResponse, unknown, Record<string, string | string[]>, "/action56/users/:id">(
  "/action56/users/:id",
  (req, res) => {
    const id: string = req.params.id;
    void id;
    // @ts-expect-error invalid param property access
    const invalidParam = req.params.invalid;
    void invalidParam;

    res.json({ id: req.params.id, name: "Charlie" });
    // @ts-expect-error invalid response payload
    res.json({ id: req.params.id, name: true });
  },
);

// Complete Params + Query + Body + Response composition
app.post<Action56UserResponse, { name: string }, { search?: string }, "/action56/full/:id">(
  "/action56/full/:id",
  async (req, res) => {
    const id: string = req.params.id;
    const search: string | undefined = req.query.search;
    const body = await req.body;
    const name: string = body.name;

    void id;
    void search;
    void name;

    // @ts-expect-error invalid param property access
    const invalidParam = req.params.invalid;
    void invalidParam;

    // @ts-expect-error invalid query property access
    const invalidQuery = req.query.invalid;
    void invalidQuery;

    // @ts-expect-error invalid body property access
    const invalidBody = body.invalid;
    void invalidBody;

    res.status(201).json({ id, name });

    // @ts-expect-error invalid response property
    res.json({ id, name, extra: true });
  },
);

// Filesystem route handler response typing
export const fsTypedResponseHandler = defineRouteHandler<
  "users/[id]",
  { search?: string },
  { name: string },
  Action56UserResponse
>(async ({ request, response }) => {
  const id: string = request.params.id;
  const search: string | undefined = request.query.search;
  const body = await request.body;
  const name: string = body.name;

  void id;
  void search;
  void name;

  response.status(200).json({ id, name });

  // @ts-expect-error invalid response payload in filesystem handler
  response.json({ id, name: 999 });
});

// 15. Action 57: Route Response Contracts & HTTP Method generic coverage
type Action57Response = { id: string; name: string };

// Action 57: Middleware compatibility with typed route handler
const commonMiddleware: Middleware = (_req, _res, next) => {
  return next();
};

app.get<Action57Response, unknown, Record<string, string | string[]>, "/action57/get/:id">(
  "/action57/get/:id",
  commonMiddleware,
  (req, res) => {
    // Valid response
    res.json({ id: req.params.id, name: "Valid GET" });

    // @ts-expect-error invalid property type
    res.json({ id: req.params.id, name: 123 });

    // @ts-expect-error missing required property
    res.json({ id: req.params.id });
  },
);

app.put<Action57Response, { name: string }, Record<string, string | string[]>, "/action57/put/:id">(
  "/action57/put/:id",
  async (req, res) => {
    const body = await req.body;
    res.json({ id: req.params.id, name: body.name });

    // @ts-expect-error invalid property type in PUT
    res.json({ id: 100, name: body.name });
  },
);

app.patch<
  Action57Response,
  { name?: string },
  Record<string, string | string[]>,
  "/action57/patch/:id"
>("/action57/patch/:id", async (req, res) => {
  const body = await req.body;
  res.json({ id: req.params.id, name: body.name ?? "default" });

  // @ts-expect-error missing required property in PATCH
  res.json({ id: req.params.id });
});

app.delete<Action57Response, unknown, Record<string, string | string[]>, "/action57/delete/:id">(
  "/action57/delete/:id",
  (req, res) => {
    res.json({ id: req.params.id, name: "deleted" });

    // @ts-expect-error invalid response payload in DELETE
    res.json({ id: req.params.id, name: false });
  },
);

app.options<Action57Response, unknown, Record<string, string | string[]>, "/action57/options">(
  "/action57/options",
  (_req, res) => {
    res.json({ id: "opt", name: "options" });

    // @ts-expect-error invalid response payload in OPTIONS
    res.json({ id: "opt", name: 456 });
  },
);

app.head<Action57Response, unknown, Record<string, string | string[]>, "/action57/head">(
  "/action57/head",
  (_req, res) => {
    res.json({ id: "h1", name: "head" });

    // @ts-expect-error invalid response payload in HEAD
    res.json({ id: true, name: "head" });
  },
);
