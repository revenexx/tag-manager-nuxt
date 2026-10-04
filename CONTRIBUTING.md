# Contributing to `@revenexx/tag-manager-nuxt`

What the package *is* and how to use it lives in the [README](README.md). This file covers how
work gets in: setup, the checks, releases, and the two contracts this repository holds.

## Setup

```bash
pnpm install
pnpm dev:prepare     # stub build + type generation for the module and the playground
pnpm dev             # runs playground/ against the module source
```

The playground ships a stand-in consent provider (`playground/plugins/consent.client.ts`) that
grants `statistics` after two seconds. To read a real container, set the credentials described
in [playground/README.md](playground/README.md).

## Before you push

CI (`.github/workflows/ci.yml`) runs on every push and pull request against `main`. Running
these locally only changes when you find out:

| Command | What it checks |
| --- | --- |
| `pnpm lint` | ESLint (`@nuxt/eslint-config`) |
| `pnpm test:types` | `vue-tsc` over the module and the playground |
| `pnpm test` | Vitest: the tag runtime, the vendor adapters, the delivery rules, the emitter, and the contract tests against the JSON Schema (with Ajv) |
| `pnpm spec:check` | every promise in `specs/` is claimed by a test tagged `@spec:<feature>:AC-n`, and every tag points at a real promise |
| `pnpm build` | `nuxt-module-build`, including the `/events` entry. Run it: a tarball without `dist` is the classic broken release. |

## Commits and pull requests

- English, imperative subject line ("Fail closed when the container route answers HTML").
- One logical change per pull request. Reference the issue it belongs to.
- No secrets anywhere: tenant names and API keys go in a git-ignored `.env`, never in code,
  docs, fixtures or commit messages.

## Releases

[Changesets](https://github.com/changesets/changesets). Every pull request that changes what
ships carries one:

```bash
pnpm changeset       # pick patch / minor / major and describe the change for users
```

Write it for someone upgrading. That text becomes the [CHANGELOG](CHANGELOG.md) entry.

On push to `main`, `.github/workflows/release.yml` opens or updates a **Version Packages** pull
request. Merging it bumps the version, writes the changelog and publishes to npm with
provenance through npm OIDC trusted publishing, so there is no `NPM_TOKEN`. The trusted
publisher binding is keyed to this repository **and the workflow filename**, so
`release.yml` keeps its name.

Peer ranges (`nuxt`, `@nuxt/scripts`), the theme event contract and the consent provider shape
are all consumer-visible. Changing any of them needs a changeset.

## Changing the theme event contract

`contract/theme-events.schema.json` is canonical. `src/runtime/events/vocabulary.ts` and
`validate.ts` restate it for the browser, and `test/contract.test.ts` fails when they drift. The
order is:

1. Edit the JSON Schema.
2. Run `pnpm test` and follow the failures into `vocabulary.ts`, `validate.ts` and `types.ts`.
3. Update [contract/README.md](contract/README.md).
4. A breaking change bumps the `schema` value (`theme-events/<n>`).
5. Open the matching pull request against the revenexx `schemas` repository, which publishes
   the schema under its `$id`.

Details: [docs/contract.md](docs/contract.md).

## Changing the consent provider shape

The provider interface is shared with
[`@revenexx/consent-manager-nuxt`](https://github.com/revenexx/consent-manager-nuxt). Neither
package imports the other, so a change has to land on both sides. Coordinate it rather than
changing it here alone.
