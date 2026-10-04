<div align="center">

# @revenexx/tag-manager-nuxt

**A consent-gated tag manager for Nuxt, built on [@nuxt/scripts](https://scripts.nuxt.com).**
It loads the marketing and analytics tags a merchant configured in the revenexx Tag Manager. Each tag loads only once the visitor's consent allows it, and the module translates a single vendor-neutral stream of storefront events (`add_to_cart`, `purchase`, `request_quote`, …) into each vendor's own calls.

[![npm version](https://img.shields.io/npm/v/@revenexx/tag-manager-nuxt?color=2B90B6)](https://www.npmjs.com/package/@revenexx/tag-manager-nuxt)
[![npm downloads](https://img.shields.io/npm/dm/@revenexx/tag-manager-nuxt?color=2B90B6)](https://www.npmjs.com/package/@revenexx/tag-manager-nuxt)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

</div>

---

## Why

- 🚦 **Nothing loads before consent.** Every tag names a vendor and a purpose. The consent provider decides when the tag would load, and again for every event it would receive. A tag that is not allowed yet loads the moment consent arrives, without a reload.
- 🗣️ **Say it once.** The theme emits *what happened* in one vocabulary ([`theme-events/1`](./contract/README.md)), and this module says it to GA4, GTM, Meta, etracker, HubSpot and the rest in their own words. There is no copy-pasted pixel code in templates.
- 🏭 **B2B events are first-class.** Quote requests, order lists and punchout transfers are part of the vocabulary, next to the GA4 e-commerce events.
- 🙈 **No personal data in events.** The event contract cannot carry an email, a name, a customer number or an address. Every object in it is closed.
- 🧩 **Configured in the Cockpit, not in `nuxt.config`.** Tags, triggers, variables and event mappings come from the published container, so a merchant changes them without a deploy.
- 🛡️ **Fails closed.** If the container is unreachable or malformed, the page renders with no tags. In editor and preview contexts no tag runs at all.
- 📦 **Usable on its own.** The event emitter and validator live at `@revenexx/tag-manager-nuxt/events` and need neither Nuxt nor this module.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Configuration](#configuration)
- [Credentials and runtime config](#credentials-and-runtime-config)
- [When a tag loads](#when-a-tag-loads)
- [The consent provider](#the-consent-provider)
- [Theme events](#theme-events)
- [How events reach a tag](#how-events-reach-a-tag)
- [Supported tags](#supported-tags)
- [`useTagManager()`](#usetagmanager)
- [Server route](#server-route)
- [Preview and debugging](#preview-and-debugging)
- [Content Security Policy](#content-security-policy)
- [Recipes](#recipes)
- [TypeScript](#typescript)
- [Compatibility](#compatibility)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)
- [A note on legal bases](#a-note-on-legal-bases)
- [Development and releasing](#development-and-releasing)

## Installation

```bash
npm i @revenexx/tag-manager-nuxt @nuxt/scripts                       # or pnpm add / yarn add
npm i @revenexx/consent-manager-nuxt                                 # recommended: the consent provider
```

`@nuxt/scripts` is a peer dependency, and it must be listed in `modules` **before** this module.
Without it, the module logs a warning and no tag can load.

## Quick start

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    '@nuxt/scripts',
    '@revenexx/consent-manager-nuxt', // provides $consentProvider
    '@revenexx/tag-manager-nuxt',
  ],
})
```

That is all the module needs. On a deployed revenexx Site the credentials are brokered per
request. For local development, point it at a tenant:

```bash
# .env (never commit it)
NUXT_TAG_MANAGER_TENANT=<your-tenant>
NUXT_TAG_MANAGER_API_KEY=<your-gateway-api-key>
```

Then emit theme events from your theme. The import does not depend on the module:

```ts
// plugins/theme-events.client.ts
import { createThemeEvents } from '@revenexx/tag-manager-nuxt/events'

export default defineNuxtPlugin((nuxtApp) => {
  const route = useRoute()
  const events = createThemeEvents({
    context: () => ({
      market: 'de', locale: 'de-DE', currency: 'EUR',
      page: { path: route.path, type: 'other' },
      customer: { authenticated: false, b2b: false },
    }),
    callHook: (name, envelope) => nuxtApp.callHook(name, envelope),
    validate: import.meta.dev,
  })
  return { provide: { themeEvents: events } }
})
```

```ts
useNuxtApp().$themeEvents.emit('add_to_cart', {
  ecommerce: { items: [{ sku: 'LS-B16-1P', name: 'Circuit breaker B16', price_net: 4.18, price_gross: 4.97, quantity: 1 }] },
})
```

## How it works

```
SSR ── plugin ── GET /_tag-manager/container ──► api.revenexx.com /v1/tag-manager/delivery/container
                 (Nitro-cached 60 s per tenant + market)
                 → container in state: tags, triggers, variables, settings, hosts (for your CSP)

browser ── app:mounted ── await $consentProvider.ready
                       └─ runtime.start(current path)
                            per tag wanted on this page:
                              allowed now?        → load (immediate | idle | first interaction)
                              not yet?            → provider.trigger(vendor, purpose) → load when granted
                              no provider/editor? → blocked
theme ── emit('add_to_cart') ──► revenexx:event (Nuxt hook + DOM event)
                                  └─ runtime: dedupe by event_id → activate event-triggered tags
                                              → per allowed tag: vendor adapter call (buffer ≤ 50 while loading)
                                              → GA4-format copy in dataLayer while a GTM tag runs
```

The plugin does not render anything and writes no Consent Mode defaults. Those belong to the
consent module.

## Configuration

All options go under `tagManager` in `nuxt.config.ts`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `false` turns the module off completely: no route, no plugin, no `useTagManager`. |
| `endpoint` | `string` | `'/_tag-manager/container'` | Path of the Nitro route the app reads the container from. **Build time only**: the route is registered when the app is built and the plugin reads the same build-time value, so it is not runtime config and no environment variable changes it. |
| `apiUrl` | `string` | `'https://api.revenexx.com'` | Gateway base URL, with or without a trailing `/v1`. Server-only. |
| `tenant` | `string` | `''` | Tenant for local development, used when no brokered context arrives. Server-only. |
| `apiKey` | `string` | `''` | Gateway API key for local development. Server-only, never sent to the browser. |
| `marketCookie` | `string` | `'cover-market'` | Cookie that holds the active market code. |
| `previewParam` | `string` | `'rvx_tm_preview'` | Query parameter that loads the unpublished draft container. |
| `debug` | `boolean` | `false` | Log every load decision and every event to the console, prefixed `[revenexx tag-manager]`, as preview mode does. |
| `editorHosts` | `string[]` | `['*.theme.rvnxx.site']` | Hosts that count as editor context: no tag loads. `*.example.com` matches every subdomain, anything else the exact host. Same option and default as the consent module's. |
| `editorPaths` | `string[]` | `['/admin', '/preview']` | Path prefixes that count as editor/preview context: no tag loads. `/admin` matches `/admin` and `/admin/**`. Same option and default as the consent module's. |

Which tags exist, what triggers them, how events map onto vendor calls, the price basis (net or
gross), the GTM data-layer name and first-party proxying are **container settings** in the
Tag Manager app, not module options.

## Credentials and runtime config

The container route calls the revenexx gateway. Per request, it decides which credentials to
use, in this order:

1. **Brokered context (deployed revenexx Sites).** The platform resolves the tenant from the
   host and injects `x-revenexx-tenant` and a signed `x-revenexx-context` token. The token is
   forwarded as `Authorization: Bearer …`. Nothing needs to be configured.
2. **`tagManager.tenant` + `tagManager.apiKey`** from runtime config, sent as
   `x-revenexx-tenant` + `x-revenexx-api-key`.
3. **`revenexxTenant` + `revenexxApiKey`** at the top level of your app's runtime config, if your
   app declares them, as the `@revenexx/cover` storefront does. This lets a theme that already
   holds a gateway key avoid configuring it twice.

A request that carries a tenant header but no token gets an API key only from a config pair
that names **the same tenant**. A key is never sent on behalf of another tenant. If nothing
matches, the route answers an empty container.

| Environment variable | Runtime config key | Side |
| --- | --- | --- |
| `NUXT_TAG_MANAGER_API_URL` | `tagManager.apiUrl` | server |
| `NUXT_TAG_MANAGER_TENANT` | `tagManager.tenant` | server |
| `NUXT_TAG_MANAGER_API_KEY` | `tagManager.apiKey` | server |
| `NUXT_PUBLIC_TAG_MANAGER_MARKET_COOKIE` | `public.tagManager.marketCookie` | public |
| `NUXT_PUBLIC_TAG_MANAGER_PREVIEW_PARAM` | `public.tagManager.previewParam` | public |
| `NUXT_PUBLIC_TAG_MANAGER_DEBUG` | `public.tagManager.debug` | public |
| `NUXT_PUBLIC_TAG_MANAGER_EDITOR_HOSTS`, `NUXT_PUBLIC_TAG_MANAGER_EDITOR_PATHS` | `public.tagManager.editorHosts` / `editorPaths` | public |

`endpoint` has no environment variable: it is fixed at build time (see above).

**Market.** The container is per market. The route takes the first valid code from: the
`?market=` query, the `x-revenexx-market` header, the `marketCookie` cookie. Codes are
lower-cased. A valid code starts with a letter or digit, continues with letters, digits, `_`
or `-`, and has at most 64 characters. Without one, no market header is sent and the gateway
decides.

## When a tag loads

A tag loads only if **all** of these hold:

1. **Not an editor or preview context.** The `editorHosts` and `editorPaths` options — by
   default hosts ending in `.theme.rvnxx.site` and the paths `/admin`, `/admin/**`,
   `/preview`, `/preview/**` — run no tag at all, with or without a consent provider. Keep
   them in step with the consent module's options of the same name.
2. **It is wanted on this page.** Either it has no triggers (it runs on every page), or a
   `page_view` trigger matches, or a `theme_event` trigger matches an event that just
   happened. Triggers can be narrowed by `path_prefixes`, `page_types` and `b2b`.
3. **It is allowed.** `provider.allows(tag.vendor, tag.purpose)` is `true`. Without a provider,
   only tags whose purpose code is `necessary` are allowed.
4. **Its load timing has come.** `immediate`, `idle` (`requestIdleCallback`, at most 3 s) or
   `interaction` (first `pointerdown`, `keydown`, `scroll` or `touchstart`).

A tag that is wanted but not allowed yet waits on `provider.trigger(vendor, purpose)` and loads
when the visitor grants consent, without a reload. A tag that becomes **not** allowed stops
receiving events immediately. Unloading its script is left to the consent module, which
reloads the page.

> **Page-level conditions need `page_view`.** On start the runtime knows only the current path.
> Triggers with `page_types` or `b2b` conditions, and tags on client-side navigations, are
> activated by the theme's `page_view` event. Emit one on every navigation (see
> [recipes](./docs/recipes.md#emit-page_view-on-every-navigation)).

## The consent provider

The module never imports a consent package. It reads `useNuxtApp().$consentProvider` and
expects this shape:

```ts
interface ConsentProvider {
  readonly ready: Promise<void>
  allows(vendor: string, purpose: string): boolean
  trigger(vendor: string, purpose: string): Promise<void> & { consented: Ref<boolean> }
  googleSignals(): Record<'ad_storage' | 'analytics_storage' | 'ad_user_data' | 'ad_personalization'
    | 'functionality_storage' | 'personalization_storage' | 'security_storage', 'granted' | 'denied'>
  onChange(cb: (state: { purposes: Record<string, string>, vendors: Record<string, string> }) => void): () => void
}
```

- [`@revenexx/consent-manager-nuxt`](https://github.com/revenexx/consent-manager-nuxt) provides
  it. Install both and you are done.
- **No provider:** only tags under the `necessary` purpose load. Everything else is `blocked`.
- **Your own consent tool:** provide an object of this shape as `consentProvider` from a
  plugin that runs before `app:mounted`. See
  [recipes → bring your own consent provider](./docs/recipes.md#bring-your-own-consent-provider).

The runtime waits for `provider.ready`, then asks `allows()` for every load and every event.
If `allows()` throws, the answer is no.

## Theme events

The theme describes what happened in **18 events**, each wrapped in an envelope:

| | Events |
| --- | --- |
| Navigation | `page_view` |
| Discovery | `view_item_list`, `search`, `select_item`, `view_item` |
| Cart & checkout | `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase` |
| B2B | `request_quote`, `add_to_orderlist`, `punchout_transfer` |
| Other | `form_submit`, `login`, `sign_up` |

Every envelope carries `schema` (`"theme-events/1"`), `event`, `event_id` (UUID v4, the
`transaction_id` for `purchase`), `occurred_at`, `market`, `locale`, `currency`,
`page: { path, type }` and `customer: { authenticated, b2b }`, plus the block the event needs:
`ecommerce`, `search`, `form`, `auth` or `punchout`.

**No personal data.** `customer` is two booleans. Every object is closed, fields such as
`email`, `phone`, `customer_number`, `company_name`, `address` or `ip` are refused by name, the
emitter strips query strings from paths, and it redacts search terms that look like an email
address or phone number.

The full contract, with every field, the per-event requirements and the default vendor
mappings, is in **[contract/README.md](./contract/README.md)**. The JSON Schema ships at
`@revenexx/tag-manager-nuxt/contract/theme-events.schema.json` (`$id`
`https://schemas.revenexx.com/theme-events.schema.json`).

**Transport.** Each envelope goes out as the Nuxt runtime hook `revenexx:event` and as a
`revenexx:event` DOM event on `window`. This module listens to both and drops the duplicate by
`event_id`. Events that arrive before the runtime has started (up to 50) are held and replayed
in order.

## How events reach a tag

Each tag in the container has an `event_map`: theme event → `{ name, params? }`, where `name`
is the vendor's own event name. The defaults come from the Tag Manager app and the merchant can
override them. For every event:

1. Tags whose `theme_event` trigger matches are activated (see [When a tag loads](#when-a-tag-loads)).
2. For every tag with a mapping for this event, the gate is checked **now**. If the tag is not
   allowed at this moment, the event is withheld. If it is allowed but still loading, the event
   is buffered (at most 50, oldest dropped) and delivered once the script is ready.
3. The tag's adapter turns the envelope into the vendor call. Amounts use the container's
   `event_price_basis` (`net` by default). Line values are summed when the event carries no
   `value_*`.
4. If `push_events_to_data_layer` is on and a GTM tag is active and allowed, a GA4-format copy is
   pushed to `window[data_layer_name]` (preceded by `{ ecommerce: null }` for commerce events).

**Variables.** Static `params` in a mapping can contain `{{code}}` placeholders. They resolve
against the container's variables: `constant` (a fixed value), `event_field` (a dotted path
into the envelope, such as `ecommerce.items.0.sku`) and `page` (`path` or `type`). A string
that is exactly one placeholder keeps the variable's type. An unresolved placeholder becomes
empty and is never sent literally.

## Supported tags

Each container tag is either a **registry** tag (one of the keys below) or a **script** tag
(any `https://` URL, which loads behind consent but receives no events). A tag's `config` is
passed to the `@nuxt/scripts` composable as its options. A `defaultConsent` key is stripped,
because Consent Mode defaults belong to the consent module.

| Registry key | Vendor | Provided by | What an event becomes |
| --- | --- | --- | --- |
| `googleAnalytics` | Google Analytics 4 | @nuxt/scripts | `gtag('event', name, GA4 params)` |
| `googleTagManager` | Google Tag Manager | @nuxt/scripts | GA4-format push to the data layer |
| `metaPixel` | Meta Pixel | @nuxt/scripts | `fbq('track' \| 'trackCustom', name, { content_ids, contents, value, currency, … })`, with `eventID` for `purchase` |
| `tiktokPixel` | TikTok Pixel | @nuxt/scripts | `ttq.track(name, { contents, value, currency, … }, { event_id })` |
| `bingUet` | Microsoft Advertising UET | @nuxt/scripts | `uetq.push('event', name, { revenue_value, currency, ecomm_prodid, … })` |
| `linkedinInsight` | LinkedIn Insight | @nuxt/scripts | `lintrk('track', { conversion_id })`, where the mapped **name is the conversion id** |
| `matomoAnalytics` | Matomo | @nuxt/scripts | `trackSiteSearch`, `setEcommerceView`, `trackEcommerceCartUpdate`, `trackEcommerceOrder`, otherwise `trackEvent` |
| `hotjar` | Hotjar | @nuxt/scripts | `hj('event', name)` |
| `clarity` | Microsoft Clarity | @nuxt/scripts | `clarity('event', name)` |
| `intercom` | Intercom | @nuxt/scripts | `Intercom('trackEvent', name, meta)` |
| `crisp` | Crisp | @nuxt/scripts | `$crisp.push(['set', 'session:event', …])` |
| `etracker` | etracker Analytics | **this module** | etCommerce: `viewProduct`, `viewProductList`, `insertToBasket`, `removeFromBasket`, `insertToWatchlist`, `removeFromWatchlist`, `order` (status `sale` for `purchase`, `lead` otherwise), otherwise a user-defined event |
| `hubspot` | HubSpot tracking code | **this module** | `_hsq`: `trackPageView` for client-side navigations, otherwise `trackCustomBehavioralEvent`. `identify` is never called. |
| `tawkTo` | Tawk.to | **this module** | `Tawk_API.addEvent(name, meta)` |

The three registry scripts this module adds are also auto-imported as composables, so a theme
can use them directly:

| Composable | Options |
| --- | --- |
| `useScriptEtracker` | `id` (secure code), `blockCookies` (default `true`), `respectDnt` (default `true`), `pagename`, `areas` |
| `useScriptHubspot` | `id` (portal id), `region` (`'na1'` default, or `'eu1'`) |
| `useScriptTawkTo` | `propertyId`, `widgetId` |

They are added to the `@nuxt/scripts` registry through its `scripts:registry` hook and
auto-imported from there. If a later `@nuxt/scripts` ships its own registry entry under the
same key, **its** entry wins everywhere: the registry, the auto-imported composable and the
composable the tag runtime calls. This module's implementation of that key is then unused, so
there is always exactly one source per key.

**First-party mode.** When the container's `first_party_mode` is off, every tag loads with
`scriptOptions.proxy = false`. Turning proxying **on** also requires the registry key to be
enabled in your app's own `scripts.registry` at build time, because `@nuxt/scripts` creates its
proxy routes then.

## `useTagManager()`

Auto-imported. Works on the server and in the browser.

```ts
const { container, hosts, preview, runtime } = useTagManager()
```

| Member | Type | Description |
| --- | --- | --- |
| `container` | `ComputedRef<DeliveredContainer>` | The container this page runs (published, or the draft in preview). Empty when none could be loaded. |
| `hosts` | `ComputedRef<string[]>` | Every third-party host the container's tags may load from or send to, as host names. Available during SSR, for a [CSP](#content-security-policy). |
| `preview` | `ComputedRef<boolean>` | Whether this page runs an unpublished draft. |
| `runtime` | `() => TagRuntime \| null` | The client runtime once started (`null` on the server and before `app:mounted`). `runtime()?.state(tagCode)` returns `'idle' \| 'waiting_for_consent' \| 'loading' \| 'loaded' \| 'blocked'`. |

## Server route

| Route | Description |
| --- | --- |
| `GET /_tag-manager/container` (the `endpoint` option) | The published container for the request's tenant and market, from `GET {apiUrl}/v1/tag-manager/delivery/container`. Nitro-cached for 60 s (stale-while-revalidate) under the key `tenant:market`, never under a credential. `?preview=<token>` reads `/v1/tag-manager/delivery/preview/{token}` and bypasses the cache. On missing credentials, a gateway error, a 3 s timeout or a body that is not a container, it answers an **empty container** rather than an error, so the page still renders. |

## Preview and debugging

- `?rvx_tm_preview=<token>` (the `previewParam` option) loads the merchant's **unpublished
  draft** from the Tag Manager app. The token must be 16–128 characters of letters, digits,
  `_` or `-`. Anything else is ignored. A draft is never cached.
- In preview, or with `debug: true`, every decision is logged with the prefix
  `[revenexx tag-manager]`: which tags load, wait for consent or are blocked and why, and which
  event went to which tag under which name.
- Consent still applies in preview. To see a marketing tag fire, grant its purpose in the
  banner.

## Content Security Policy

`useTagManager().hosts` lists every host the container's tags need, already during SSR. Build
your `script-src` / `connect-src` / `img-src` from it, for example as a response header:

```ts
// app.vue (or a layout), runs on the server
const { hosts } = useTagManager()
if (import.meta.server) {
  const origins = hosts.value.map(h => `https://${h}`).join(' ')
  useResponseHeader('Content-Security-Policy').value
    = `script-src 'self' 'unsafe-inline' ${origins}; connect-src 'self' ${origins}; img-src 'self' data: ${origins}`
}
```

`'unsafe-inline'` (or a nonce) is needed for the inline Consent Mode script the consent module
writes. Adjust the policy to the rest of your app.

## Recipes

Running with or without the consent module, a custom consent provider, emitting theme events
from a theme without this module, `page_view` on every navigation, e-commerce and B2B events,
etracker and HubSpot, vendors the module does not know, preview, and the CSP are collected in
the **[cookbook → docs/recipes.md](./docs/recipes.md)**.

## TypeScript

Event contract types come from the `/events` subpath:

```ts
import type {
  ThemeEventEnvelope, ThemeEventName, ThemeEventItem, ThemeEventEcommerce, ThemeEventContext,
  ThemeEventData, ThemeEvents, ThemeEventsOptions, PageType,
} from '@revenexx/tag-manager-nuxt/events'
```

The package root exports the module's public types:

```ts
import type {
  ModuleOptions, TagManagerRuntimeConfig, TagManagerPublicRuntimeConfig,
  ConsentProvider, ConsentState, ConsentDecision,
  DeliveredContainer, ContainerTag, ContainerTrigger, ContainerVariable, TriggerConditions,
  EventMapEntry, TagManagerSettings, LoadTiming, PriceBasis,
  TagRuntime, TagLoadState, TagLoader, UseTagManager, EditorContextOptions, AddedRegistryKey,
} from '@revenexx/tag-manager-nuxt'
import { ADDED_REGISTRY_SCRIPTS } from '@revenexx/tag-manager-nuxt' // a value: the registry keys this module adds
```

Runtime config is typed under the module's own key: `useRuntimeConfig().tagManager`
(`TagManagerRuntimeConfig`, server only) and `useRuntimeConfig().public.tagManager`
(`TagManagerPublicRuntimeConfig`). The module augments `#app`: the runtime hook
`'revenexx:event'` is typed with `ThemeEventEnvelope`, and `NuxtApp.$consentProvider` is typed
as optional.

## Compatibility

| | |
| --- | --- |
| Nuxt | `>= 4.0.0` |
| `@nuxt/scripts` | `^1.0.0` (peer; the registry was checked against 1.3.x) |
| Node | `>= 22` |
| Consent | any provider with the shape above. [`@revenexx/consent-manager-nuxt`](https://github.com/revenexx/consent-manager-nuxt) is the reference. |
| Container source | the revenexx Tag Manager app, reached through `api.revenexx.com` |

## Troubleshooting

- **No tag loads at all.** Open `/_tag-manager/container`. If `tags` is empty, check the
  credentials (see [Credentials](#credentials-and-runtime-config)) and that a container is
  published for this market. Then check the console with `debug: true`: `blocked … no consent
  provider and not necessary` means `$consentProvider` is missing, and `blocked … editor or
  preview context` means you are on `*.theme.rvnxx.site`, `/admin` or `/preview`.
- **`@revenexx/tag-manager-nuxt builds on @nuxt/scripts` warning.** Add `'@nuxt/scripts'` to
  `modules` before this module.
- **A tag waits forever (`waiting_for_consent`).** The tag's vendor or purpose code does not
  exist in the consent policy, or the visitor has not granted it. The codes must match the
  consent policy exactly.
- **A tag with a page-type or B2B condition never fires.** These conditions are evaluated on
  the theme's `page_view` event. Emit `page_view` with the right `page.type` and
  `customer.b2b`.
- **Events do not reach a vendor.** The tag needs a mapping for that event in its `event_map`,
  must be allowed at the moment of the event, and must have loaded. Invalid envelopes are
  dropped by the emitter when `validate` is on, so watch the console for
  `[revenexx theme-events] '…' not emitted`.
- **`purchase` is sent once only.** That is intended: a `purchase` is deduplicated by
  `transaction_id` per browser session, so reloading the confirmation page does not count the
  order twice.

## Related packages

- [`@revenexx/consent-manager-nuxt`](https://github.com/revenexx/consent-manager-nuxt): the
  server-rendered consent banner that provides `$consentProvider`. Neither package imports the
  other.
- [`@nuxt/scripts`](https://scripts.nuxt.com): the loader and registry this module builds on.

## A note on legal bases

This module enforces what the consent provider answers for each tag's vendor and purpose. Which
purpose a tag belongs to, and which legal basis that purpose has, are decided by the merchant in
the Tag Manager and Consent Manager apps. This README describes the module's behaviour and is
not legal advice.

## Development and releasing

```bash
pnpm install
pnpm dev:prepare
pnpm dev          # playground/
pnpm lint && pnpm test:types && pnpm test && pnpm spec:check && pnpm build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [docs/](./docs/index.md). Releases are automated
with [Changesets](https://github.com/changesets/changesets) and npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers), so no tokens are involved:

1. `pnpm changeset`: choose a bump and describe the change, then commit the generated file.
2. On push to `main`, the **Release** workflow opens a "Version Packages" PR.
3. Merging that PR bumps the version, updates [CHANGELOG.md](./CHANGELOG.md) and publishes to
   npm with provenance.

## License

[MIT](./LICENSE) © revenexx
