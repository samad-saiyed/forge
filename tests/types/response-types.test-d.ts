import { z } from "zod";
import { defineRoute } from "../../packages/core/src/index.js";
import { zodSchema } from "../../packages/zod/src/index.js";

type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;

const UserResponseZod = z.object({
  id: z.string(),
  name: z.string(),
});

// 1. Direct Zod response schema type checking on res.json
export const routeWithZodResponse = defineRoute(
  {
    response: UserResponseZod,
  },
  async (_req, res) => {
    // Valid res.json
    res.json({ id: "1", name: "Alice" });

    // @ts-expect-error invalid property type on res.json
    res.json({ id: "1", name: 123 });

    // @ts-expect-error missing required field on res.json
    res.json({ id: "1" });
  },
);

// 2. Wrapped zodSchema response schema type checking on res.json
export const routeWithWrappedResponse = defineRoute(
  {
    response: zodSchema(UserResponseZod),
  },
  async (_req, res) => {
    // Valid res.json
    res.json({ id: "2", name: "Bob" });

    // @ts-expect-error invalid property type on res.json
    res.json({ id: "2", name: true });
  },
);

// 3. Verify response schema type inference
type InferredResType = typeof UserResponseZod._output;
export const checkInferredResType: AssertEqual<InferredResType, { id: string; name: string }> =
  true;
