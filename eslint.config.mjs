// Relative import (not a `workspace:*` dependency) keeps @expys/sdk free of any
// internal package references so it stays cleanly publishable to npm. The eslint
// plugins the preset pulls in are hoisted to the repo-root node_modules.
import { createConfig } from "../eslint/preset.bun.mjs";

export default [
  // Generated types are emitted verbatim by openapi-typescript and guarded by a
  // drift gate — never lint or reformat them or the gate breaks. dist is build
  // output.
  // scripts/ holds runtime smoke checks (.mjs) that import the built dist and are
  // not part of the type-checked tsconfig project; docs-api/ is generated typedoc
  // output (it copies linked examples into media/). Both are linted out here.
  {
    ignores: [
      "src/generated/**",
      "dist/**",
      "docs-api/**",
      "tsdown.config.ts",
      "scripts/**",
    ],
  },
  ...createConfig({ tsconfigRootDir: import.meta.dirname }),
];
