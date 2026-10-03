# Feature specs

What this module promises, one spec per surface. Every promise here is bound to a test that
proves it; `spec:check` holds the two together.

## Specs

- [loader.md](loader.md) — which marketing tag loads on a page, and which storefront event
  reaches it, under the visitor's consent.
- [storefront-events.md](storefront-events.md) — the event contract itself: one envelope per
  thing that happened, validated, deduplicated for orders, and free of personal data.

## What is not promised yet

- **The container route as a running server.** The rules for whom it calls the gateway as are
  promised by tests on their own. The route inside a running Nitro server is checked by hand
  in the playground until the module has an end-to-end layer, under the epic
  [RAD-177](https://linear.app/revenexx/issue/RAD-177).

## How a spec is cut here

- **The contract is its own spec, not part of the loader.** A theme emits through it without
  installing the loader at all, so its promises have a different reader.

## Words these specs use

- **marketing tag** — one vendor script a merchant configures, with its vendor and purpose.
  Not: *pixel*, *snippet*.
- **envelope** — one storefront event as it travels, with its context. Not: *payload*.

## The surfaces, and what the product calls them

| Surface | Promised in |
| --- | --- |
| The module in a theme | [loader.md](loader.md) |
| The storefront event hook — `revenexx:event` | [loader.md](loader.md), [storefront-events.md](storefront-events.md) |
| The contract — storefront-events/1 | [storefront-events.md](storefront-events.md) |
| The emitter — `@revenexx/tag-manager-nuxt/events` | [storefront-events.md](storefront-events.md) |

## How this stays true

Every AC declares how it is verified, and every automated one is claimed by a test titled
`@spec:<feature>:AC-n`. The gate fails when a promise has no claimant or a claim resolves to
no promise.

- Run the gate: `pnpm spec:check`
- Run one feature's proofs: `pnpm exec vitest run -t '@spec:<feature>'`
