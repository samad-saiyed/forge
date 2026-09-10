import type { IncomingMessage } from "node:http";

export class Request {
  constructor(public readonly raw: IncomingMessage) {}
}
