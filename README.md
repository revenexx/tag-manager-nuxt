<div align="center">

# @revenexx/tag-manager-nuxt

**The Nuxt module for the revenexx Tag Manager.**
Loads the tag container the Tag Manager app published, lets each marketing tag load only when the visitor's consent allows it, and turns the theme event contract into each vendor's own calls — built on [@nuxt/scripts](https://scripts.nuxt.com).

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

</div>

---

## Why

- **Nothing loads past the banner.** Every tag names a vendor and a purpose; the consent provider decides, at load time and again for every event.
- **No pixel spaghetti.** The theme says *what happened* once (`add_to_cart`, `purchase`, `request_quote`, …). The module says it to etracker, GA4, Meta, HubSpot and the rest in their own words.
- **B2B events included.** Quote requests, order lists and punchout transfers are first-class.
- **No personal data in events.** The contract forbids it by construction.
- **Configured in the Cockpit, not in `nuxt.config`.** The container comes from the API, cached 60 s.

## Installation

```bash
pnpm add @revenexx/tag-manager-nuxt @nuxt/scripts
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/scripts', '@revenexx/consent-manager-nuxt', '@revenexx/tag-manager-nuxt'],
})
```

A theme that uses it declares the capability it needs (ADR-0061):

```json
{ "requires": [{ "capability": "tag-manager.delivery.container" }] }
```

On a deployed Site the platform injects the tenant context and nothing else is needed. For
local development set `NUXT_TAG_MANAGER_TENANT` and `NUXT_TAG_MANAGER_API_KEY` (server-side
only), or reuse cover's `NUXT_REVENEXX_TENANT` / `NUXT_REVENEXX_API_KEY`.

## Options

| Option | Default | |
| --- | --- | --- |
| `enabled` | `true` | |
| `endpoint` | `/_tag-manager/container` | The Nitro route the app reads the container from. |
| `apiUrl` | `https://api.revenexx.com` | Gateway. |
| `tenant`, `apiKey` | `''` | Local-dev fallback credentials (runtime config, never public). |
| `marketCookie` | `cover-market` | Cookie carrying the active market code. |
| `previewParam` | `rvx_tm_preview` | Query parameter that loads the unpublished draft. |
| `debug` | `false` | Log decisions and events, as preview mode does. |

## Emitting theme events

The contract lives at `@revenexx/tag-manager-nuxt/events` and needs no module:

```ts
import { createThemeEvents } from '@revenexx/tag-manager-nuxt/events'

const events = createThemeEvents({
  context: () => ({ market: 'de', locale: 'de-DE', currency: 'EUR', page: { path: route.path, type: 'product' }, customer: { authenticated, b2b } }),
  callHook: (name, envelope) => nuxtApp.callHook(name, envelope),
  validate: import.meta.dev,
})
events.emit('view_item', { ecommerce: { items: [{ sku, name, price_net, price_gross, quantity: 1 }] } })
```

See [`contract/README.md`](./contract/README.md) for the vocabulary, the envelope and the
forbidden fields.

## Runtime API

```ts
const { hosts, container, preview } = useTagManager()
// hosts: every third-party host of the container — feed it into the theme's CSP script-src / connect-src
```

`?rvx_tm_preview=<token>` loads the draft and logs every decision with the prefix
`[revenexx tag-manager]`.

## The consent provider

The module never imports the consent module. It reads `useNuxtApp().$consentProvider`:

```ts
interface ConsentProvider {
  readonly ready: Promise<void>
  allows(vendor: string, purpose: string): boolean
  trigger(vendor: string, purpose: string): Promise<void> & { consented: Ref<boolean> }
  googleSignals(): Record<string, 'granted' | 'denied'>
  onChange(cb: (state) => void): () => void
}
```

Without a provider only tags under the `necessary` purpose load. On editor and preview hosts
nothing loads.

## Supported tags

`googleTagManager`, `googleAnalytics`, `metaPixel`, `linkedinInsight`, `bingUet`,
`tiktokPixel`, `matomoAnalytics`, `hotjar`, `clarity`, `intercom`, `crisp` from @nuxt/scripts;
`etracker` (with etCommerce: `viewProduct`, `viewProductList`, `insertToBasket`,
`removeFromBasket`, `order`), `hubspot` and `tawkTo` added by this module. Plus `script` tags
(any https URL), which load but receive no events.

## Development

```bash
pnpm install
pnpm dev:prepare
pnpm dev          # playground
pnpm test         # vitest
pnpm test:types
pnpm lint
pnpm spec:check   # promises in specs/ ↔ tests
pnpm build
```

Releases go through Changesets and npm trusted publishing (`release.yml`).

More: [`docs/index.md`](./docs/index.md).

## License

MIT
