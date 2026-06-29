/**
 * Streaming: subscribe to new conversation messages over SSE, with cancellation.
 * Zero UI.
 *
 * Run: EXPYS_MEMBER_TOKEN=... EXPYS_CONVERSATION_ID=... bun examples/stream-messages.ts
 *
 * EXPYS_MEMBER_TOKEN is a short-lived member token your backend obtained from
 * POST /v1/auth/exchange. streamMessages is member-only (no externalUserID) and
 * pushes only NEW messages; use listMessages for the backlog. The stream
 * reconnects with backoff on transient failures and ends on a permanent error.
 */
/* eslint-disable no-console -- runnable sample prints flow output */
import { initialize } from "../src/index";

const token = process.env.EXPYS_MEMBER_TOKEN;
if (!token) {
  throw new Error(
    "Set EXPYS_MEMBER_TOKEN (a member token from your backend's /v1/auth/exchange)",
  );
}

const conversationId = process.env.EXPYS_CONVERSATION_ID;
if (!conversationId) {
  throw new Error("Set EXPYS_CONVERSATION_ID (a conversation to stream)");
}
// Narrow for use inside main() (a module-level const isn't narrowed across it).
const cnv: string = conversationId;

const expys = initialize({
  baseUrl: process.env.EXPYS_BASE_URL,
  environment: "sandbox",
  token,
});

async function main(): Promise<void> {
  // Optional: print the recent backlog first, then live-stream what follows.
  const { messages } = await expys.listMessages(cnv, { limit: 20 });
  for (const message of messages) {
    console.log(`[history ${message.authorID}] ${message.body ?? "(no body)"}`);
  }

  let received = 0;
  console.log("listening for new messages (stops after 5)...");

  // `for await` consumes the AsyncIterable lazily. Breaking the loop (here, after
  // five messages) tears down the underlying HTTP connection and any reconnect
  // timer - no leaked sockets. In a real app you would break on a signal /
  // unmount instead of a fixed count.
  for await (const message of expys.streamMessages(cnv)) {
    received += 1;
    console.log(`[live ${message.authorID}] ${message.body ?? "(no body)"}`);
    if (received >= 5) {
      break; // closes the connection
    }
  }

  console.log(`done: received ${received} live message(s)`);
}

void main();
