# Security Policy - @expys/sdk

`@expys/sdk` is covered by the Expys monorepo [Security Policy](../../SECURITY.md).

- **Do not open a public issue or PR for a vulnerability.**
- Report it privately via GitHub's private vulnerability reporting on this
  repository (Security -> Report a vulnerability), or email **security@expys.dev**
  with the affected version, a description, and reproduction steps.

The SDK sends **no telemetry**: it makes requests only to the API base URL you
configure, adding only a `User-Agent` (SDK + spec version, environment, and an
optional org id for server-side attribution).

See the [full policy](../../SECURITY.md) for supported versions and response
timelines.
