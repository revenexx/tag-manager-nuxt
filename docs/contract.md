# The storefront event contract

The contract, its vocabulary, the forbidden fields, the transport and the emission points in
`@revenexx/cover` are documented next to the schema itself: [`contract/README.md`](../contract/README.md).

How this repository keeps the schema and the code from drifting:

- `src/runtime/events/vocabulary.ts` restates the enumerations and the per-event requirements.
- `src/runtime/events/validate.ts` is a dependency-free validator for the browser.
- `test/contract.test.ts` checks both against the JSON — the event list, page types, forbidden
  fields and every `allOf` requirement — and runs each fixture through the handwritten
  validator AND a real 2020-12 validator (ajv), failing when they disagree.

Changing the contract means: edit the JSON, run `pnpm test`, follow the failures into the two
files above, bump `storefront-events/<n>` for a breaking change, and open the PR against
`schemas`.
