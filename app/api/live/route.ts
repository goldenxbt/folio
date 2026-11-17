import { connection } from "next/server";
import { watchTicks } from "@/lib/binance-feed";
import { getCoin } from "@/lib/coins";

const MAX_IDS = 8;

function parseIds(value: string | null): string[] {
  if (!value) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id) || !getCoin(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_IDS) break;
  }
  return ids;
}

export async function GET(request: Request) {
  await connection();
  const ids = parseIds(new URL(request.url).searchParams.get("ids"));
  const encoder = new TextEncoder();
  let stop = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const stream = new ReadableStream({
    start(controller) {
      const finish = () => {
        if (stopped) return;
        stopped = true;
        if (heartbeat) clearInterval(heartbeat);
        stop();
        try {
          controller.close();
        } catch {
          // The browser already hung up.
        }
      };

      const write = (chunk: string) => {
        if (stopped) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          finish();
        }
      };

      write(": ok\n\n");
      stop = watchTicks(ids, (ticks) => {
        write(`data: ${JSON.stringify(ticks)}\n\n`);
      });
      heartbeat = setInterval(() => write(": ping\n\n"), 15_000);
      request.signal.addEventListener("abort", finish);
    },
    cancel() {
      if (stopped) return;
      stopped = true;
      if (heartbeat) clearInterval(heartbeat);
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
