import { z } from "zod";
import { defineRoute } from "../../packages/core/src/index.js";
import { zodSchema } from "../../packages/zod/src/index.js";

type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;

// 1. Direct Zod schema inference for req.body
const UserBodyZod = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.coerce.number(),
});

export const routeDirectZodBody = defineRoute(
  {
    validate: {
      body: UserBodyZod,
    },
  },
  async (req) => {
    const body = await req.body;
    const name: string = body.name;
    const email: string = body.email;
    const age: number = body.age;

    void name;
    void email;
    void age;

    // @ts-expect-error invalid property access on direct Zod body
    const invalid = body.nonexistent;
    void invalid;
  },
);

// 2. Wrapped zodSchema inference for req.body
export const routeWrappedZodBody = defineRoute(
  {
    validate: {
      body: zodSchema(UserBodyZod),
    },
  },
  async (req) => {
    const body = await req.body;
    const name: string = body.name;
    const email: string = body.email;
    const age: number = body.age;

    void name;
    void email;
    void age;

    // @ts-expect-error invalid property access on wrapped Zod body
    const invalid = body.nonexistent;
    void invalid;
  },
);

// 3. Direct Zod schema query & params & headers inference with transformations
const QueryZod = z.object({
  page: z.coerce.number(),
  search: z.string().optional(),
});

const ParamsZod = z.object({
  userId: z.string(),
});

const HeadersZod = z.object({
  "x-api-key": z.string(),
});

export const routeFullZodInferred = defineRoute(
  {
    validate: {
      params: ParamsZod,
      query: QueryZod,
      headers: HeadersZod,
      body: UserBodyZod,
    },
  },
  async (req) => {
    const userId: string = req.params.userId;
    const page: number = req.query.page;
    const search: string | undefined = req.query.search;
    const apiKey: string = req.headers["x-api-key"];
    const body = await req.body;

    void userId;
    void page;
    void search;
    void apiKey;
    void body;

    // @ts-expect-error invalid params access
    const pErr = req.params.invalid;
    // @ts-expect-error invalid query access
    const qErr = req.query.invalid;
    // @ts-expect-error invalid headers access
    const hErr = req.headers.invalid;

    void pErr;
    void qErr;
    void hErr;
  },
);

// 4. Zod string transformation output type test
const TransformedZod = z.object({
  tags: z.string().transform((val) => val.split(",")),
});

export const routeTransformedZod = defineRoute(
  {
    validate: {
      body: TransformedZod,
    },
  },
  async (req) => {
    const body = await req.body;
    const tags: string[] = body.tags;
    void tags;

    // @ts-expect-error invalid property access
    const err = body.invalid;
    void err;
  },
);

// 5. Verify type check assertion helper
type InferredBodyType = typeof UserBodyZod._output;
export const checkInferredType: AssertEqual<
  InferredBodyType,
  { name: string; email: string; age: number }
> = true;
