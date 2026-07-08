import type { Env } from "./types";
import { NotionClient, val } from "./notion/client";
import { P } from "./notion/schema";

// 1x1 transparent GIF.
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

function pixelResponse(): Response {
  return new Response(PIXEL, {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, private",
      "content-length": String(PIXEL.length),
    },
  });
}

const UUID = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i;

/** GET /t/o/{pageId}: record an email open, then return the tracking pixel. */
export async function handleOpen(pageId: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (UUID.test(pageId)) ctx.waitUntil(recordOpen(pageId, env).catch((e) => console.warn("open track:", (e as Error).message)));
  return pixelResponse();
}

/** GET /t/c/{pageId}?u=<url>: record a click, then redirect to the real link. */
export async function handleClick(pageId: string, target: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  let dest: string;
  try {
    dest = new URL(target).toString();
  } catch {
    return new Response("bad target", { status: 400 });
  }
  if (UUID.test(pageId)) {
    ctx.waitUntil(bump(env, `clicks:${pageId}`).catch(() => {}));
  }
  return Response.redirect(dest, 302);
}

async function recordOpen(pageId: string, env: Env): Promise<void> {
  const count = await bump(env, `opens:${pageId}`);
  const notion = new NotionClient(env.NOTION_TOKEN);
  await notion.updatePage(pageId, {
    [P.opened]: val.checkbox(true),
    [P.openCount]: val.number(count),
    [P.lastOpened]: val.date(new Date().toISOString().slice(0, 10)),
  });
}

async function bump(env: Env, key: string): Promise<number> {
  const current = parseInt((await env.JOBS.get(key)) ?? "0", 10) || 0;
  const next = current + 1;
  await env.JOBS.put(key, String(next));
  return next;
}
