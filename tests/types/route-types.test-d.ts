import {
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
app.get<unknown, { search: string; page?: string }>("/users", (req) => {
  const search: string = req.query.search;
  const page: string | undefined = req.query.page;
  void search;
  void page;
  // @ts-expect-error invalid property access on typed query
  const invalid = req.query.invalid;
  void invalid;
});

app.get<unknown, { search: string }, "/users/:id">("/users/:id", (req) => {
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
type TestUserCtx = RouteContext<{ id: string }, { search?: string }, { name: string }>;

export const checkCtxParams: AssertEqual<TestUserCtx["params"], { id: string }> = true;
export const checkCtxQuery: AssertEqual<TestUserCtx["query"], { search?: string }> = true;
export const checkCtxBody: AssertEqual<TestUserCtx["body"], Promise<{ name: string }>> = true;
export const checkCtxReq: AssertEqual<
  TestUserCtx["request"],
  Request<{ id: string }, { search?: string }, { name: string }>
> = true;
export const checkCtxRes: AssertEqual<TestUserCtx["response"], Response> = true;

// Verify RouteHandler usability with RouteContext
type HandlerFromCtx = RouteHandler<TestUserCtx>;
type DirectHandler = RouteHandler<{ id: string }, { search?: string }, { name: string }>;

export const checkRouteHandlerFromCtx: AssertEqual<HandlerFromCtx, DirectHandler> = true;

// 7. Typed body tests
type UserPayload = { name: string; age?: number };

app.post<UserPayload>("/users", async (req) => {
  const body = await req.body;
  const name: string = body.name;
  const age: number | undefined = body.age;
  void name;
  void age;
  // @ts-expect-error invalid property access on typed body
  const invalid = body.invalid;
  void invalid;
});

app.post<UserPayload, { search?: string }, "/users/:id">("/users/:id", async (req) => {
  const id: string = req.params.id;
  const search: string | undefined = req.query.search;
  const body = await req.body;
  const name: string = body.name;
  void id;
  void search;
  void name;
});
