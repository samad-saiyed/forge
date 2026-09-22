import Busboy, { type BusboyConstructor, type BusboyHeaders } from "@fastify/busboy";
import { performance } from "node:perf_hooks";
import { Readable } from "node:stream";

const boundary = "----KyuuBenchmarkBoundary";

const fileContent = Buffer.alloc(1024 * 1024, "a");

function createMultipartPayload(): Buffer {
  const chunks = [
    Buffer.from(
      `--${boundary}\r\n` + `Content-Disposition: form-data; name="name"\r\n\r\n` + `Kyuu\r\n`,
    ),
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="test.bin"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
    ),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];

  return Buffer.concat(chunks);
}

interface MultipartRequest extends Readable {
  headers: Record<string, string>;
}

function createRequest(body: Buffer): MultipartRequest {
  const request = Readable.from([body]) as MultipartRequest;

  request.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": body.length.toString(),
  };

  Object.assign(request, {
    method: "POST",
    url: "/",
  });

  return request;
}

async function parseWithBusboy(body: Buffer): Promise<void> {
  const request = createRequest(body);

  await new Promise<void>((resolve, reject) => {
    const BusboyCtor = Busboy as unknown as BusboyConstructor;
    const busboy = BusboyCtor({
      headers: request.headers as unknown as BusboyHeaders,
    });

    busboy.on("field", () => {});

    busboy.on("file", (_name: string, stream: Readable) => {
      stream.resume();
    });

    busboy.once("finish", resolve);
    busboy.once("error", reject);

    request.pipe(busboy);
  });
}

async function benchmark(
  name: string,
  parser: () => Promise<void>,
  iterations: number,
): Promise<void> {
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    await parser();
  }

  const duration = performance.now() - start;

  console.log({
    parser: name,
    iterations,
    payloadMb: 1,
    durationMs: Number(duration.toFixed(2)),
    opsPerSecond: Math.round((iterations / duration) * 1000),
  });
}

export async function runBodyParserBenchmark(): Promise<void> {
  const iterations = 100;

  const payload = createMultipartPayload();

  console.log("\nMultipart benchmark:");

  await benchmark("busboy", () => parseWithBusboy(payload), iterations);
}
