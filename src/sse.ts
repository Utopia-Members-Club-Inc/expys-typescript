// A minimal Server-Sent Events parser, kept pure (an async generator over a
// chunk stream) so the data-accumulation rules are testable without a network.
// Implements only the slice of the SSE wire format the stream endpoint uses:
// `data:` lines (accumulated, newline-joined) terminated by a blank line, with
// comment lines (`:`-prefixed heartbeats) ignored. `event:`/`id:` and other
// fields are accepted but unused.

const FIELD_SEPARATOR = ":";

// Strips a single optional leading space after the field colon, per the spec
// (a second space is significant and preserved).
const stripLeadingSpace = (value: string): string =>
  value.startsWith(" ") ? value.slice(1) : value;

/// Parses an async stream of UTF-8 text chunks into the `data` payload string of
/// each complete SSE event. Lines are reassembled across arbitrary chunk
/// boundaries; CRLF and LF endings are both accepted; comment lines are skipped.
/// A non-blank trailing event (no final blank line before end-of-stream) is
/// flushed when the source completes.
export async function* parseSseEvents(
  chunks: AsyncIterable<string>,
): AsyncGenerator<string, void, unknown> {
  let buffer = "";
  let dataLines: string[] = [];
  let sawData = false;

  const flush = function* (): Generator<string> {
    if (sawData) {
      yield dataLines.join("\n");
    }
    dataLines = [];
    sawData = false;
  };

  const handleLine = function* (rawLine: string): Generator<string> {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") {
      yield* flush();
      return;
    }
    if (line.startsWith(FIELD_SEPARATOR)) {
      return; // comment / heartbeat
    }
    const colon = line.indexOf(FIELD_SEPARATOR);
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : stripLeadingSpace(line.slice(colon + 1));
    if (field === "data") {
      sawData = true;
      dataLines = [...dataLines, value];
    }
  };

  for await (const chunk of chunks) {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const rawLine = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      yield* handleLine(rawLine);
      newline = buffer.indexOf("\n");
    }
  }

  // Flush a final line with no trailing newline, then any pending event.
  if (buffer !== "") {
    yield* handleLine(buffer);
  }
  yield* flush();
}
