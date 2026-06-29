/**
 * Conversations: list threads, read their messages, and send a message. Zero UI.
 *
 * Run: EXPYS_MEMBER_TOKEN=... bun examples/conversations.ts
 *
 * EXPYS_MEMBER_TOKEN is a short-lived member token your backend obtained from
 * POST /v1/auth/exchange. listConversations/listMessages accept an optional
 * externalUserID (a machine token acting on a member's behalf); sendMessage is
 * member-only and takes no externalUserID.
 */
/* eslint-disable no-console -- runnable sample prints flow output */
import { initialize } from "../src/index";

const token = process.env.EXPYS_MEMBER_TOKEN;
if (!token) {
  throw new Error(
    "Set EXPYS_MEMBER_TOKEN (a member token from your backend's /v1/auth/exchange)",
  );
}

const expys = initialize({
  baseUrl: process.env.EXPYS_BASE_URL,
  environment: "sandbox",
  token,
});

const externalUserID = process.env.EXPYS_EXTERNAL_USER_ID;

async function main(): Promise<void> {
  const { conversations } = await expys.listConversations({ externalUserID });
  console.log(`found ${conversations.length} conversations`);

  const conversation = conversations[0];
  if (!conversation) {
    return;
  }
  console.log(`reading: ${conversation.title ?? conversation.id}`);

  const { messages } = await expys.listMessages(conversation.id, {
    externalUserID,
    limit: 50,
  });
  for (const message of messages) {
    console.log(`[${message.authorID}] ${message.body ?? "(no body)"}`);
  }

  // Writes auto-send an Idempotency-Key so a retry replays rather than double-posts.
  const result = await expys.sendMessage(conversation.id, "Hello from the SDK");
  console.log(`message sent: ok=${result.ok}`);
}

void main();
