# Theme events: `theme-events/1`

A small, vendor-neutral vocabulary that a storefront theme uses to say **what happened**: a
page was shown, an item was added to the cart, an order was placed, a quote was requested. The
theme says it once. Listeners such as
[`@revenexx/tag-manager-nuxt`](https://github.com/revenexx/tag-manager-nuxt) translate it into
each analytics or marketing vendor's own calls.

- **Canonical schema:** [`theme-events.schema.json`](./theme-events.schema.json) in this
  directory (JSON Schema 2020-12). Its `$id` is
  `https://schemas.revenexx.com/theme-events.schema.json`.
- **Shipped with the package:** `@revenexx/tag-manager-nuxt/contract/theme-events.schema.json`.
- **Emitter, validator and types:** `@revenexx/tag-manager-nuxt/events`. It has no Nuxt or Vue
  dependency and no side effects, so a theme can emit without installing the Tag Manager
  module.

Event names follow GA4 because most other vendors map onto it. The B2B events GA4 has no name
for (quotes, order lists, punchout) are added.

## The envelope

One JSON object per event:

```json
{
  "schema": "theme-events/1",
  "event": "add_to_cart",
  "event_id": "9b0c3f0e-5c1e-4d43-9c6b-2a8b9d1f7e10",
  "occurred_at": "2026-10-03T09:12:44.120Z",
  "market": "de",
  "locale": "de-DE",
  "currency": "EUR",
  "page": { "path": "/p/ls-b16-1p", "type": "product" },
  "customer": { "authenticated": true, "b2b": true },
  "ecommerce": {
    "value_net": 41.80,
    "value_gross": 49.74,
    "items": [{
      "sku": "LS-B16-1P",
      "name": "Circuit breaker B16 1-pole",
      "brand": "Hager",
      "category_path": ["Installation", "Protective devices"],
      "price_net": 4.18,
      "price_gross": 4.97,
      "quantity": 10,
      "list_position": 3
    }]
  }
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schema` | `"theme-events/1"` | ✓ | The contract version. A listener reads only versions it supports. |
| `event` | one of the [18 event names](#vocabulary-v1) | ✓ | What happened. |
| `event_id` | string, 1–128 | ✓ | A UUID v4, except for `purchase`, where it **is** the `transaction_id`, so the emitter and any vendor can drop a repeat of the same order. |
| `occurred_at` | RFC 3339 date-time | ✓ | When it happened, UTC, by the browser's clock. |
| `market` | `^[a-z0-9][a-z0-9_-]*$`, ≤ 64 | ✓ | The market code the storefront runs in. |
| `locale` | BCP 47 (`de-DE`) | ✓ | The UI locale. |
| `currency` | ISO 4217 (`EUR`) | ✓ | The currency of every amount in this envelope. |
| `page` | `{ path, type }` | ✓ | `path` is the route path **without** query string or fragment. `type` is one of `home`, `category`, `search`, `product`, `cart`, `checkout`, `confirmation`, `account`, `quote`, `orderlist`, `punchout`, `login`, `register`, `content`, `other`. |
| `customer` | `{ authenticated, b2b }` | ✓ | Exactly two booleans: whether the visitor is signed in and whether they buy for a business. Nothing else about the visitor, ever. |
| `ecommerce` | object | per event | The commerce part, see below. |
| `search` | `{ search_term, results_count }` | `search` | `search_term` ≤ 256, `results_count` integer ≥ 0. |
| `form` | `{ form_code, outcome? }` | `form_submit` | `form_code` is the form's code (its slug), never a field value. `outcome` is `accepted` or `rejected`. |
| `auth` | `{ method }` | `login`, `sign_up` | `password`, `magic_link`, `otp`, `sso`, `punchout` or `other`. |
| `punchout` | `{ protocol }` | `punchout_transfer` | `oci` or `cxml`. |

**`ecommerce`**

| Field | Type | Description |
| --- | --- | --- |
| `items` | item[], ≤ 200 | The product lines. |
| `value_net` / `value_gross` | number ≥ 0 or `null` | Sum of the event's lines (or of the order) before / including tax. Must be numbers for `purchase`. |
| `tax` | number ≥ 0 | Tax amount of the order. |
| `shipping` | number ≥ 0 | Shipping cost of the order, net. |
| `transaction_id` | string, 1–128 | The order number the platform issued. Never the buyer's own purchase-order reference. |
| `coupon` | string ≤ 64 | The promotion code applied. |
| `list_id` | string, 1–128 | A stable id of the list shown: `category:<slug-path>`, `search`, `cross-sell`, `orderlist:<id>`. |
| `list_name` | string ≤ 256 | The list as a person reads it. |
| `shipping_tier` | string, 1–64 | The chosen shipping method code. |
| `payment_type` | string, 1–64 | The chosen payment method code. |

**Item**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `sku` | string, 1–128 | ✓ | The article number. Every vendor mapping uses it as the product id. |
| `name` | string, 1–256 | ✓ | The product name as the storefront shows it. |
| `quantity` | number > 0 | ✓ | Units. It is a number, not an integer, because cable is sold by the metre. |
| `brand` | string ≤ 128 | | Manufacturer or brand. |
| `category_path` | string[], ≤ 5 | | Category labels from the root down. Mappings truncate from the end (GA4 takes 5, etracker 4). |
| `variant` | string ≤ 128 | | The chosen variant as a label. |
| `price_net` / `price_gross` | number ≥ 0 or `null` | | Unit price before / including tax. `null` when the price is unknown (on request), never `0`. |
| `list_position` | integer ≥ 1 | | 1-based position in the list the item was shown in. |
| `list_id` | string ≤ 128 | | The list the item was shown in, when it differs from the event's list. |

Every object in the schema is **closed** (`additionalProperties: false`), so an unexpected field
is a validation error, not a convention. Which of net or gross a vendor receives is a listener
setting. The Tag Manager calls it `event_price_basis`, and B2B shops typically use net.

## Vocabulary v1

| Event | Required besides the envelope | Typical source | Default etracker | Default GA4 / Meta |
| --- | --- | --- | --- | --- |
| `page_view` | `page.type` | every navigation | page view (by the loader) | `page_view` / `PageView` |
| `view_item_list` | `ecommerce.list_id`, ≥ 1 item | category listing | `viewProductList` (categorylist) | same / – |
| `search` | `search.search_term`, `search.results_count` | search results | `viewProductList` (searchlist) | `search` / `Search` |
| `select_item` | exactly 1 item | click on a product card | – | same / – |
| `view_item` | exactly 1 item | product detail page | `viewProduct` | same / `ViewContent` |
| `add_to_cart` | ≥ 1 item | cart add succeeded | `insertToBasket` | same / `AddToCart` |
| `remove_from_cart` | ≥ 1 item | cart line removed or reduced | `removeFromBasket` | same / – |
| `view_cart` | `items` (may be empty) | cart page | – | same / – |
| `begin_checkout` | ≥ 1 item | checkout opened | – | same / `InitiateCheckout` |
| `add_shipping_info` | `shipping_tier`, ≥ 1 item | shipping method chosen | – | same / – |
| `add_payment_info` | `payment_type`, ≥ 1 item | payment method chosen | – | same / `AddPaymentInfo` |
| `purchase` | `transaction_id`, `value_net`, `value_gross`, `tax`, `shipping`, ≥ 1 item | order confirmation | `order` (status `sale`) | same / `Purchase` |
| `request_quote` (B2B) | ≥ 1 item | quote requested | `order` (status `lead`) | `generate_lead` / `Lead` |
| `add_to_orderlist` (B2B) | ≥ 1 item | saved to an order list | `insertToWatchlist` | `add_to_wishlist` / `AddToWishlist` |
| `punchout_transfer` (B2B) | `value_net`, `value_gross`, ≥ 1 item, `punchout.protocol` | basket handed back to the buyer's procurement system | `order` (status `lead`) | `purchase` with `punchout: true` |
| `form_submit` | `form.form_code` | a form was submitted | – | `generate_lead` / `Lead` |
| `login`, `sign_up` | `auth.method` | sign-in / registration succeeded | – | same / `CompleteRegistration` |

The "default" columns describe the mappings the revenexx Tag Manager app suggests. They are
frozen into each published container, and a merchant can override them per tag, so the
contract itself does not fix any vendor call.

## No personal data

The contract carries **no personal data**, by construction:

- `customer` is two booleans and nothing else.
- Every object is closed, so nothing can ride along on an item or the envelope.
- These field names are refused anywhere, and the validator names them in its error message
  (the list is also in the schema as `x-revenexx-forbidden-fields`): `email`, `e_mail`,
  `mail`, `name_first`, `first_name`, `last_name`, `full_name`, `phone`, `telephone`,
  `mobile`, `customer_number`, `customer_id`, `contact_id`, `organization_id`, `user_id`,
  `company`, `company_name`, `street`, `address`, `postal_code`, `zip`, `city`, `ip`,
  `ip_address`, `birthdate`, `vat_id`.
- The emitter scrubs the two places where a visitor's own typing reaches an envelope, whether
  or not validation is on: it strips a `page.path` of its query and fragment, and it replaces
  a `search_term` that looks like an email address or a phone/customer number (seven or more
  digits) with `[redacted]`.

Features that need personal data, such as Enhanced Conversions or customer matching, are out
of scope for `theme-events/1` for exactly this reason.

## Transport

An envelope travels two ways at once, under one name:

| Channel | Listener |
| --- | --- |
| Nuxt runtime hook `revenexx:event` | Nuxt modules: `nuxtApp.hook('revenexx:event', envelope => …)` |
| DOM event `revenexx:event` on `window` | anything else: `window.addEventListener('revenexx:event', e => e.detail)` |

A listener that hears both, like the Tag Manager, drops the second copy by `event_id`.

## Emitting from a theme

```ts
// plugins/theme-events.client.ts — no Tag Manager module needed for this import
import { createThemeEvents } from '@revenexx/tag-manager-nuxt/events'

export default defineNuxtPlugin((nuxtApp) => {
  const route = useRoute()
  const events = createThemeEvents({
    context: () => ({
      market: 'de',
      locale: 'de-DE',
      currency: 'EUR',
      page: { path: route.path, type: 'other' },
      customer: { authenticated: false, b2b: false },
    }),
    callHook: (name, envelope) => nuxtApp.callHook(name, envelope),
    validate: import.meta.dev, // in development: invalid envelopes are logged and dropped
  })
  return { provide: { themeEvents: events } }
})
```

```ts
const { $themeEvents } = useNuxtApp()
$themeEvents.emit('add_to_cart', { ecommerce: { items: [{ sku: 'LS-B16-1P', name: 'Circuit breaker B16', price_net: 4.18, price_gross: 4.97, quantity: 1 }] } })
// → nuxtApp.callHook('revenexx:event', envelope)
// → window.dispatchEvent(new CustomEvent('revenexx:event', { detail: envelope }))
```

`createThemeEvents(options)`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `context` | `() => ThemeEventContext` | required | Read on every `emit`: `market`, `locale`, `currency`, `page`, `customer`. |
| `callHook` | `(name, envelope) => unknown` | none | Usually `(n, e) => nuxtApp.callHook(n, e)`. Omit outside Nuxt. |
| `target` | `{ dispatchEvent } \| null` | `window` in a browser | Where the DOM event is dispatched. `null` disables it. |
| `validate` | `boolean` | `false` | Validate every envelope. An invalid one is not emitted. |
| `onInvalid` | `'warn' \| 'throw'` | `'warn'` | With `validate`: log and drop, or throw a `TypeError`. |
| `storage` | `StorageLike \| null` | `sessionStorage` if usable | Where emitted `purchase` transaction ids are remembered. |
| `uuid`, `now`, `logger` | functions | `crypto.randomUUID`, `new Date`, `console` | Injection points for tests. |

`emit(event, data?)` returns the envelope that went out, or `null` when nothing was emitted
(invalid in validate mode, or a `purchase` already emitted for that `transaction_id`). `data`
may carry `ecommerce`, `search`, `form`, `auth`, `punchout` and a `page` that overrides the
context's page.

**Purchase dedupe.** A `purchase` takes its `transaction_id` as `event_id` and is emitted once
per transaction and browser session, even if the confirmation page is reloaded.

## Validating

```ts
import { validateThemeEvent, assertThemeEvent } from '@revenexx/tag-manager-nuxt/events'

validateThemeEvent(envelope)  // string[]: every violation, empty when valid
assertThemeEvent(envelope)    // throws a TypeError listing every violation
```

The bundled validator has no dependencies and is meant for the browser. The repository's tests
run every fixture through it **and** through a full JSON Schema 2020-12 validator (Ajv), and
fail when the two disagree. Server-side, you can validate against the schema itself:

```ts
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import schema from '@revenexx/tag-manager-nuxt/contract/theme-events.schema.json' with { type: 'json' }

const validate = addFormats(new Ajv2020({ allErrors: true })).compile(schema)
validate(envelope) // boolean, details in validate.errors
```

## Exports of `@revenexx/tag-manager-nuxt/events`

| Export | Kind | Description |
| --- | --- | --- |
| `createThemeEvents` | function | The emitter. |
| `scrubThemeEvent` | function | The privacy pass the emitter applies (path, search term). |
| `validateThemeEvent`, `assertThemeEvent` | functions | The validator. |
| `THEME_EVENTS_SCHEMA`, `THEME_EVENTS_SCHEMA_ID` | constants | `'theme-events/1'`, the schema `$id`. |
| `THEME_EVENT_HOOK`, `THEME_EVENT_DOM` | constants | `'revenexx:event'`. |
| `THEME_EVENT_NAMES`, `B2B_EVENT_NAMES`, `PAGE_TYPES`, `AUTH_METHODS`, `PUNCHOUT_PROTOCOLS`, `FORBIDDEN_FIELDS` | constants | The vocabulary. |
| `ECOMMERCE_REQUIREMENTS`, `BLOCK_REQUIREMENTS` | constants | The per-event requirements. |
| types | — | `ThemeEventEnvelope`, `ThemeEventName`, `ThemeEventItem`, `ThemeEventEcommerce`, `ThemeEventPage`, `ThemeEventCustomer`, `ThemeEventContext`, `ThemeEventData`, `ThemeEventSearch`, `ThemeEventForm`, `ThemeEventAuth`, `ThemeEventPunchout`, `PageType`, `AuthMethod`, `PunchoutProtocol`, `ThemeEvents`, `ThemeEventsOptions`, `StorageLike` |

## Versioning

A breaking change to the vocabulary or the envelope means a new `schema` value
(`theme-events/2`). Listeners read only the versions they support.
