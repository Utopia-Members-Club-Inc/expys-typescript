import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Captures the OpenAPI spec version into a committed file so the published build
// is self-contained: tsdown.config.ts reads this instead of reaching into the
// monorepo-only ../api-spec path, which lets the public mirror build standalone.
// Run by `bun run codegen`; drift against the spec is gated by `codegen:check`.
const here = dirname(fileURLToPath(import.meta.url));

const { info } = JSON.parse(
  readFileSync(resolve(here, "../../api-spec/v1.sdk.json"), "utf8"),
) as { info: { version: string } };

writeFileSync(
  resolve(here, "../src/generated/spec.version.json"),
  `${JSON.stringify({ specVersion: info.version }, null, 2)}\n`,
);
