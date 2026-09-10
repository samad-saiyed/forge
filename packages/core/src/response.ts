import type { ServerResponse } from "node:http";

export class Response {
  constructor(public readonly raw: ServerResponse) {}
}
