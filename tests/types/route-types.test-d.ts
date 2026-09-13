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
