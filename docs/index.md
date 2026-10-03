# @revenexx/tag-manager-nuxt — how it works

## The pieces

| Piece | What it does |
| --- | --- |
| `src/module.ts` | Registers etracker, HubSpot and Tawk.to in the @nuxt/scripts registry (`scripts:registry` hook), the Nitro route, the plugin and `useTagManager`. |
| `src/runtime/server/routes/container.get.ts` | `GET /_tag-manager/container` → `tag-manager.delivery.container` (or `tag-manager.delivery.preview/{token}`). Nitro-cached 60 s per tenant + market; a preview request bypasses the cache. |
| `src/runtime/server/utils/delivery.ts` | Who the route calls the gateway as: the brokered `x-revenexx-tenant` + `x-revenexx-context` (ADR-0062), else `tagManager.tenant/apiKey`, else cover's `revenexxTenant/revenexxApiKey`. Never another tenant's key. |
| `src/runtime/plugin.ts` | Loads the container during SSR (so `hosts` exist for a CSP), then on `app:mounted` waits for `$consentProvider.ready` and starts the runtime. |
| `src/runtime/core/runtime.ts` | The gating rule, triggers, buffering (≤ 50 per tag) and event delivery. Framework-free; the tests drive it. |
| `src/runtime/core/adapters.ts` | One adapter per registry key: storefront event + event-map entry → the vendor's own call. |
| `src/runtime/events/` (+ `src/events.ts`) | The contract's emitter and validator — the `/events` subpath. |

## Decisions

1. **The consent provider is the only coupling to the consent module.** No import of
   `@revenexx/consent-manager-nuxt`; `nuxtApp.$consentProvider` with the shared-contract shape.
   No provider → only tags whose purpose is `necessary` load.
2. **An editor or preview host runs no tag at all** (`*.theme.rvnxx.site`, `/admin/**`,
   `/preview/**`), provider or not — the first conjunct of the gating rule.
3. **The gate is checked twice**: when a tag would load, and when each event happens. A
   buffered event was allowed when it happened and is delivered once the tag is ready.
4. **Allowed → not allowed is a reload, and the consent module does it.** This module only
   stops delivering events to a tag that is no longer allowed.
5. **Consent Mode defaults are never written here.** `defaultConsent` is stripped from every
   tag config; the consent module writes `gtag('consent','default',…)` first in `<head>`.
6. **The dataLayer copy is GTM's, not everybody's.** Storefront events are pushed to
   `window[data_layer_name]` in GA4 format — `{ ecommerce: null }` first — only while a GTM tag
   is allowed and active.
7. **One tag per registry key.** @nuxt/scripts keeps one instance per registry key; the app
   refuses a second tag with the same key at publish.
8. **The draft is a separate route.** `?rvx_tm_preview=<token>` reads
   `tag-manager.delivery.preview/{token}`, uncached at both the gateway and Nitro, and turns on
   console logging prefixed `[revenexx tag-manager]`.

## What @nuxt/scripts brings and what this adds

@nuxt/scripts brings the loader, the consent trigger shape and the registry composables for
GTM, GA4, Meta, LinkedIn, Bing UET, TikTok, Matomo, Hotjar, Clarity, Intercom and Crisp. This
module adds etracker (with etCommerce), HubSpot and — because 1.3.x has none — Tawk.to, the
container from the API instead of `nuxt.config`, and the storefront events.

## first_party_mode

The tenant setting can switch first-party proxying OFF per tag at runtime
(`scriptOptions.proxy = false`). Switching it ON needs the registry key enabled in the theme's
own `scripts.registry` at build time, because @nuxt/scripts creates its proxy routes then.
