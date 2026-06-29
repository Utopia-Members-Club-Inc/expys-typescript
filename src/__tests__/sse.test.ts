import { describe, expect, it } from "bun:test";

import { parseSseEvents } from "../sse";

// Turns a list of string chunks into the async line iterable the parser reads.
// A real network delivers bytes in arbitrary boundaries; the parser must not
// assume a chunk equals a line, so each chunk here may carry partial lines.
async function* chunks(parts: string[]): AsyncIterable<string> {
  for (const part of parts) {
    await Promise.resolve(); // model the network's asynchronous chunk delivery
    yield part;
  }
}

async function collect(events: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const event of events) {
    out.push(event);
  }
  return out;
}

describe("sse::parseSseEvents", () => {
  it("yields the data payload of a single complete event", async () => {
    const events = parseSseEvents(chunks(['data: {"id":"m1"}\n\n']));
    expect(await collect(events)).toEqual(['{"id":"m1"}']);
  });

  it("strips exactly one leading space after the field colon", async () => {
    // "data:x" (no space) and "data: x" (one space) both yield "x"; a second
    // space is preserved per the SSE spec.
    const events = parseSseEvents(
      chunks(["data:no-space\n\n", "data:  two-spaces\n\n"]),
    );
    expect(await collect(events)).toEqual(["no-space", " two-spaces"]);
  });

  it("accumulates multi-line data joined by newlines", async () => {
    const events = parseSseEvents(chunks(["data: line1\ndata: line2\n\n"]));
    expect(await collect(events)).toEqual(["line1\nline2"]);
  });

  it("ignores comment/heartbeat lines beginning with a colon", async () => {
    const events = parseSseEvents(
      chunks([": heartbeat\n\n", "data: real\n\n", ": heartbeat\n\n"]),
    );
    expect(await collect(events)).toEqual(["real"]);
  });

  it("reassembles an event split across chunk boundaries", async () => {
    const events = parseSseEvents(chunks(["data: par", "tial\n", "\n"]));
    expect(await collect(events)).toEqual(["partial"]);
  });

  it("does not emit an event for a blank-line-terminated comment-only block", async () => {
    const events = parseSseEvents(chunks([": just a comment\n\n"]));
    expect(await collect(events)).toEqual([]);
  });

  it("handles CRLF line endings", async () => {
    const events = parseSseEvents(chunks(["data: crlf\r\n\r\n"]));
    expect(await collect(events)).toEqual(["crlf"]);
  });

  it("emits a trailing event with no final blank line when the stream ends", async () => {
    const events = parseSseEvents(chunks(["data: tail\n"]));
    expect(await collect(events)).toEqual(["tail"]);
  });

  it("ignores unknown fields and yields only data", async () => {
    const events = parseSseEvents(
      chunks(["event: message\nid: 7\ndata: payload\n\n"]),
    );
    expect(await collect(events)).toEqual(["payload"]);
  });
});
