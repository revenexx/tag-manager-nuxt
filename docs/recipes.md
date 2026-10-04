# Cookbook

Real-world patterns with `@revenexx/tag-manager-nuxt`. The [README](../README.md) covers
installation and the reference. Vendor and purpose codes below (`google-analytics`,
`statistics`, `etracker`, …) are examples and must match **your** consent policy and container.

- [With the revenexx consent module](#with-the-revenexx-consent-module)
- [Without a consent module](#without-a-consent-module)
- [Bring your own consent provider](#bring-your-own-consent-provider)
- [Emit theme events from a theme (without this module)](#emit-theme-events-from-a-theme-without-this-module)
- [Emit `page_view` on every navigation](#emit-page_view-on-every-navigation)
- [E-commerce events](#e-commerce-events)
- [B2B events](#b2b-events)
- [Emit from outside Vue](#emit-from-outside-vue)
- [etracker and HubSpot](#etracker-and-hubspot)
- [A vendor the module does not know](#a-vendor-the-module-does-not-know)
- [Preview a draft container](#preview-a-draft-container)
- [Build a Content Security Policy from the container](#build-a-content-security-policy-from-the-container)
- [Listen to theme events yourself](#listen-to-theme-events-yourself)

## With the revenexx consent module

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/scripts', '@revenexx/consent-manager-nuxt', '@revenexx/tag-manager-nuxt'],
})
```

[`@revenexx/consent-manager-nuxt`](https://github.com/revenexx/consent-manager-nuxt) renders the
banner, writes the Google Consent Mode default and provides `$consentProvider`. Each container
tag carries a vendor code and a purpose code from that consent policy. When the visitor clicks
**Accept all**, waiting tags load without a reload. When a later decision revokes a vendor
whose tag already loaded, the consent module reloads the page and the tag stays out.

## Without a consent module

The module still works. With no `$consentProvider`, only tags whose purpose code is
`necessary` load, and every other tag is `blocked`. Use this for sites where every configured
tag is strictly necessary, for example a support chat the merchant classifies that way, or in
tests.

## Bring your own consent provider

Any consent tool can drive the module. Provide an object of the provider shape from a plugin:

```ts
// plugins/consent-provider.ts
import { ref } from 'vue'

type Signal = 'ad_storage' | 'analytics_storage' | 'ad_user_data' | 'ad_personalization'
  | 'functionality_storage' | 'personalization_storage' | 'security_storage'

export default defineNuxtPlugin((nuxtApp) => {
  // Replace with your CMP's API: which purposes the visitor granted.
  const granted = new Set<string>(['necessary'])
  const listeners = new Set<() => void>()
  const waiters: Array<{ purpose: string, done: () => void }> = []

  function grant(purpose: string) { // call this from your CMP's "consent changed" callback
    granted.add(purpose)
    for (const w of waiters.filter(w => w.purpose === purpose)) w.done()
    for (const cb of listeners) cb()
  }

  const provider = {
    ready: Promise.resolve(), // resolve once your CMP has read its stored decision
    allows: (_vendor: string, purpose: string) => granted.has(purpose),
    trigger(_vendor: string, purpose: string) {
      const consented = ref(granted.has(purpose))
      const promise = new Promise<void>((resolve) => {
        if (consented.value) return resolve()
        waiters.push({ purpose, done: () => { consented.value = true; resolve() } })
      }) as Promise<void> & { consented: typeof consented }
      promise.consented = consented
      return promise
    },
    googleSignals: () => ({
      ad_storage: 'denied', analytics_storage: granted.has('statistics') ? 'granted' : 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied', functionality_storage: 'denied',
      personalization_storage: 'denied', security_storage: 'granted',
    }) as Record<Signal, 'granted' | 'denied'>,
    onChange(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) },
  }

  nuxtApp.provide('consentProvider', provider)
})
```

Rules the runtime relies on:

- `ready` must resolve, because the runtime awaits it before loading anything. A rejected
  `ready` is tolerated, and `allows()` then decides.
- `allows()` must be synchronous and cheap, because it runs for every event.
- `trigger()` resolves when the vendor becomes allowed. Never resolving is fine and means "never
  load".
- Provide it before the app mounts (any normal plugin does).
- This module writes **no** Consent Mode defaults. If your tags are Google tags, your consent
  tool must write `gtag('consent', 'default', …)` before them.

The playground's `plugins/consent.client.ts` is a runnable version of this, granting
`statistics` after two seconds.

## Emit theme events from a theme (without this module)

The emitter is a plain library. A theme can ship it whether or not the merchant installs the
Tag Manager, and a theme extension can listen to the DOM event.

```ts
// plugins/theme-events.client.ts
import { createThemeEvents } from '@revenexx/tag-manager-nuxt/events'
import type { PageType } from '@revenexx/tag-manager-nuxt/events'

export default defineNuxtPlugin((nuxtApp) => {
  const route = useRoute()
  const shop = useShopContext() // your own: market, locale, currency, session

  const events = createThemeEvents({
    context: () => ({
      market: shop.market,
      locale: shop.locale,
      currency: shop.currency,
      page: { path: route.path, type: (route.meta.pageType as PageType) ?? 'other' },
      customer: { authenticated: shop.signedIn, b2b: shop.isBusiness },
    }),
    callHook: (name, envelope) => nuxtApp.callHook(name, envelope),
    validate: import.meta.dev,
  })

  return { provide: { themeEvents: events } }
})
```

- `context()` is read on every `emit`, so it always reflects the current page and session.
- `validate: import.meta.dev` drops and logs invalid envelopes during development. In
  production the emitter still applies the privacy scrubbing (path query, search term).
- Do not emit in an editor or preview shell where sample data is rendered, such as a page
  builder seeding a demo cart. The Tag Manager ignores those hosts anyway, but other listeners
  may not.

## Emit `page_view` on every navigation

Tags with page-type or B2B conditions, and tags that should start on client-side navigations,
are activated by `page_view`:

```ts
// in the same plugin
nuxtApp.hook('page:finish', () => {
  events.emit('page_view')
})
```

`page:finish` fires after the initial render and after every client-side navigation. Set the
page `type` through the context, for example from `definePageMeta({ pageType: 'product' })` as
in the plugin above.

## E-commerce events

```ts
const { $themeEvents } = useNuxtApp()
const line = { sku: 'LS-B16-1P', name: 'Circuit breaker B16', brand: 'Hager', category_path: ['Installation', 'Protective devices'], price_net: 4.18, price_gross: 4.97, quantity: 10 }

// a category listing
$themeEvents.emit('view_item_list', { ecommerce: { list_id: 'category:installation/protective-devices', list_name: 'Protective devices', items: [{ ...line, quantity: 1, list_position: 1 }] } })

// product detail page: exactly one item
$themeEvents.emit('view_item', { ecommerce: { items: [{ ...line, quantity: 1 }] } })

// after the cart confirmed the add
$themeEvents.emit('add_to_cart', { ecommerce: { items: [line] } })

// order confirmation: once per order, even if the page is reloaded
$themeEvents.emit('purchase', {
  ecommerce: { transaction_id: 'ORD-000123', value_net: 41.80, value_gross: 49.74, tax: 7.94, shipping: 0, items: [line] },
})
```

- Unknown prices are `null`, never `0`, so price-on-request items do not show up as free.
- Emit `add_to_cart` **after** the cart accepted the line, not on click.
- `transaction_id` is the order number the platform issued, not the buyer's own purchase-order
  reference.

## B2B events

```ts
$themeEvents.emit('request_quote', { ecommerce: { items: [line] } })
$themeEvents.emit('add_to_orderlist', { ecommerce: { items: [line] } })
$themeEvents.emit('punchout_transfer', {
  ecommerce: { value_net: 41.80, value_gross: 49.74, items: [line] },
  punchout: { protocol: 'oci' },
})
```

By default etracker records `request_quote` and `punchout_transfer` as an order with status
`lead`, GA4 receives `generate_lead` and `purchase` (with `punchout: true`), and Meta receives
`Lead`. The merchant can change each mapping per tag in the Tag Manager app.

## Emit from outside Vue

A theme extension or a plain script can emit without the emitter by dispatching the DOM event.
In that case you build the envelope yourself and are responsible for its validity:

```js
window.dispatchEvent(new CustomEvent('revenexx:event', {
  detail: {
    schema: 'theme-events/1',
    event: 'form_submit',
    event_id: crypto.randomUUID(),
    occurred_at: new Date().toISOString(),
    market: 'de', locale: 'de-DE', currency: 'EUR',
    page: { path: location.pathname, type: 'content' },
    customer: { authenticated: false, b2b: false },
    form: { form_code: 'contact', outcome: 'accepted' },
  },
}))
```

Prefer `createThemeEvents({ context })` without `callHook` where you can: it fills in the id,
the timestamp and the scrubbing for you, and still dispatches the DOM event.

## etracker and HubSpot

Both are built in. You do not need a `scripts:registry` hook of your own: the module adds
`etracker`, `hubspot` and `tawkTo` to the `@nuxt/scripts` registry during setup.

**Through the Tag Manager (the normal way).** The merchant creates a tag with registry key
`etracker` (config `{ "id": "<secure code>" }`, optionally `blockCookies`, `respectDnt`,
`pagename`, `areas`) or `hubspot` (`{ "id": <portal id>, "region": "eu1" }`) and maps theme
events onto the vendor calls. For etracker the module queues every etCommerce call on
`_etrackerOnReady`, so calls made before `e.js` has loaded are not lost.

**Directly in a theme**, gated by the same consent provider:

```ts
const { $consentProvider } = useNuxtApp()

useScriptEtracker({
  id: 'AbC123',
  blockCookies: true,
  scriptOptions: { trigger: $consentProvider!.trigger('etracker', 'statistics') },
})

useScriptHubspot({
  id: 1234567,
  region: 'eu1',
  scriptOptions: { trigger: $consentProvider!.trigger('hubspot', 'marketing') },
})
```

Do not also configure the same vendor as a container tag. `@nuxt/scripts` keeps one instance per
registry key, and the Tag Manager app refuses a second tag with the same key for the same
reason.

## A vendor the module does not know

The registry of tags the runtime can drive is fixed in this version (see the
[supported tags](../README.md#supported-tags)). For anything else:

- **Script tag.** In the Tag Manager app, create a tag of kind `script` with an `https://` URL.
  It loads under the same consent and trigger rules but receives no theme events.
- **Your own code**, listening to the theme events and gated by the provider:

```ts
// plugins/my-vendor.client.ts
export default defineNuxtPlugin((nuxtApp) => {
  const provider = nuxtApp.$consentProvider
  if (!provider) return

  const { proxy } = useScript('https://cdn.example-vendor.com/tag.js', {
    trigger: provider.trigger('example-vendor', 'marketing'),
  })

  nuxtApp.hook('revenexx:event', (envelope) => {
    if (envelope.event !== 'purchase') return
    if (!provider.allows('example-vendor', 'marketing')) return // check at the moment of the event
    proxy.track('order', { value: envelope.ecommerce?.value_net, currency: envelope.currency })
  })
})
```

## Preview a draft container

In the Tag Manager app, open the preview link for the draft. It is any storefront URL with the
preview token:

```
https://shop.example.com/?rvx_tm_preview=<token>
```

The draft is fetched uncached and every decision is logged in the browser console with the
prefix `[revenexx tag-manager]`. Consent still applies, so grant the purpose in the banner to
see a marketing tag fire. Rename the parameter with the `previewParam` option. For the same
logging without a draft, set `tagManager: { debug: true }`.

## Build a Content Security Policy from the container

`useTagManager().hosts` is filled during SSR, so the header can be set on the same response:

```ts
// app.vue
const { hosts } = useTagManager()
if (import.meta.server) {
  const origins = hosts.value.map(h => `https://${h}`).join(' ')
  useResponseHeader('Content-Security-Policy').value = [
    `script-src 'self' 'unsafe-inline' ${origins}`,
    `connect-src 'self' ${origins}`,
    `img-src 'self' data: ${origins}`,
    `frame-src 'self' ${origins}`,
  ].join('; ')
}
```

The list changes when the merchant publishes a new container, so do not hard-code it.

## Listen to theme events yourself

```ts
// Nuxt plugin: typed with ThemeEventEnvelope
nuxtApp.hook('revenexx:event', (envelope) => {
  console.log(envelope.event, envelope.ecommerce?.items?.length)
})

// anywhere in the browser
window.addEventListener('revenexx:event', (e) => {
  const envelope = (e as CustomEvent).detail
})
```

Both channels carry every envelope, so listen to one of them, or deduplicate by `event_id` as
this module does.
