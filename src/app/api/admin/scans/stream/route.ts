import { verifyAuthToken } from "@/lib/auth";
import { subscribeScans, subscribeNotifications } from "@/lib/scanBus";

export const dynamic = "force-dynamic";

/* Live gate feed as Server-Sent Events. EventSource can't set headers,
   so the access token travels as a query parameter. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const auth = await verifyAuthToken(token);
  if (!auth || (auth.kind !== "admin" && auth.kind !== "scanner")) {
    return new Response("Unauthorized", { status: 401 });
  }

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
      const unsubscribe = subscribeScans((event) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });
      /* notifications ride the same stream as named SSE events, so
         EventSource listeners can pick the channel they care about */
      const unsubscribeNotifications = subscribeNotifications((event) => {
        send(`event: notification\ndata: ${JSON.stringify(event)}\n\n`);
      });
      /* keep proxies (ngrok) from timing the stream out */
      const heartbeat = setInterval(() => send(`: ping\n\n`), 25_000);
      cleanup = () => {
        unsubscribe();
        unsubscribeNotifications();
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
