import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { hermesProxyMiddleware } from "../../server/hermesProxy";

/** Chama o middleware do proxy como o Vite chamaria. */
export async function callProxy(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body = "",
  remoteAddress = "127.0.0.1",
) {
  const request = new PassThrough() as unknown as IncomingMessage;
  Object.assign(request, { method, url, headers: { host: "127.0.0.1:5173", ...headers }, socket: { remoteAddress } });
  let status = 0;
  let payload = "";
  const done = new Promise<void>((resolve) => {
    const response = {
      statusCode: 200,
      setHeader: () => undefined,
      end: (chunk?: string) => {
        status = response.statusCode;
        payload = chunk ?? "";
        resolve();
      },
    } as unknown as ServerResponse;
    void hermesProxyMiddleware(request, response, () => resolve());
  });
  (request as unknown as PassThrough).end(body);
  await done;
  return { status, json: payload ? (JSON.parse(payload) as Record<string, unknown>) : {} };
}
