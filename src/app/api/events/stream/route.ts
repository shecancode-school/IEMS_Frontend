import { subscribeContentChanges } from "@/lib/scanBus";

export const dynamic = "force-dynamic";

/* Public live channel for the landing page: pings subscribers whenever an
   event is created, edited or gets a new poster, so the hero card and
   calendar refresh without a reload. Carries no private data — just a
   "something changed" signal. */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          /* stream already closed */
        }
      };
      send(`: connected\n\n`);
      const unsubscribe = subscribeContentChanges((scope) => {
        send(`data: ${JSON.stringify({ scope })}\n\n`);
      });
      /* keep proxies (ngrok) from timing the stream out */
      const heartbeat = setInterval(() => send(`: ping\n\n`), 25_000);
      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
