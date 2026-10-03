# Storefront event contract — `storefront-events/1`

`storefront-events.schema.json` in this directory is the canonical contract (JSON Schema
2020-12, `$id` `https://schemas.revenexx.com/storefront-events.schema.json`). It is
published from the `schemas` repository; this copy is the source that PR is made from, and
the package ships it at `@revenexx/tag-manager-nuxt/contract/storefront-events.schema.json`.

Two sides read it. The **theme** (`@revenexx/cover`) says what happened. **Listeners** hear
it: `@revenexx/tag-manager-nuxt` in the browser today, the Analytics Studio server-side later
(#142). PostHog never — it is internal (ADR-0025). Theme extensions (ADR-0111) will use the
same vocabulary through the host bridge's `track` action, which the host translates into
`emit()`.

## Envelope

```json
{
  "schema": "storefront-events/1",
  "event": "add_to_cart",
  "event_id": "9b0c3f0e-…",
  "occurred_at": "2026-10-03T09:12:44.120Z",
  "market": "de", "locale": "de-DE", "currency": "EUR",
  "page": { "path": "/p/schuetz-ls-16a", "type": "product" },
  "customer": { "authenticated": true, "b2b": true },
  "ecommerce": {
    "value_net": 41.80, "value_gross": 49.74,
    "items": [ { "sku": "LS-B16-1P", "name": "Leitungsschutzschalter B16 1-polig",
                 "brand": "Hager", "category_path": ["Installation", "Schutzgeräte"],
                 "price_net": 4.18, "price_gross": 4.97, "quantity": 10, "list_position": 3 } ]
  }
}
```

- `event_id` is a UUID v4 — except `purchase`, where it **is** the `transaction_id`, so the
  emitter and any vendor can drop a repeat of the same order.
- `page.path` never carries a query string or fragment; the emitter strips them.
- `customer` is exactly two booleans. The schema closes every object, so a forbidden field is a
  validation error rather than a convention.
- Amounts: `price_net`/`price_gross` per unit, `null` when the price is on request (never 0);
  `value_net`/`value_gross` for the event. Which of the two a tag receives is the Tag Manager
  setting `event_price_basis` (B2B: net).

## Vocabulary v1

| Event | Required | etracker (#59) | GA4 / Meta |
| --- | --- | --- | --- |
| `page_view` | `page.type` | page view (by the loader) | `page_view` / `PageView` |
| `view_item_list` | `ecommerce.list_id`, `items` | `viewProductList` (categorylist) | same / – |
| `search` | `search.search_term`, `search.results_count` | `viewProductList` (searchlist) | `search` / `Search` |
| `select_item` | exactly one item | – | same / – |
| `view_item` | exactly one item | `viewProduct` | same / `ViewContent` |
| `add_to_cart` | `items` | `insertToBasket` | same / `AddToCart` |
| `remove_from_cart` | `items` | `removeFromBasket` | same / – |
| `view_cart` | `items` (may be empty) | – | same / – |
| `begin_checkout` | `items` | – | same / `InitiateCheckout` |
| `add_shipping_info` | `shipping_tier`, `items` | – | same / – |
| `add_payment_info` | `payment_type`, `items` | – | same / `AddPaymentInfo` |
| `purchase` | `transaction_id`, `value_net`, `value_gross`, `tax`, `shipping`, `items` | `order` (status sale) | same / `Purchase` |
| `request_quote` (B2B) | `items` | `order` (status lead) | `generate_lead` / `Lead` |
| `add_to_orderlist` (B2B) | `items` | `insertToWatchlist` | `add_to_wishlist` / `AddToWishlist` |
| `punchout_transfer` (B2B) | `value_net`, `value_gross`, `items`, `punchout.protocol` | `order` (status lead) | `purchase` with `punchout: true` |
| `form_submit` | `form.form_code` | – | `generate_lead` / `Lead` |
| `login`, `sign_up` | `auth.method` | – | same / `CompleteRegistration` |

The default vendor mappings are served by the Tag Manager app (`GET /tag-manager/registry`)
and frozen into each published container, so a tenant can override one mapping per tag.

## Forbidden: personal data

No email, name, phone, customer number, customer/contact/organization/user id, company name,
address, postal code, city, IP or VAT id — anywhere. The list is in the schema as
`x-revenexx-forbidden-fields` and in the validator's error messages. The emitter additionally
replaces a search term that looks like an email address or a phone number by `[redacted]`.
Enhanced Conversions and customer matching are out of scope for v1 for exactly this reason.

## Transport

```ts
// in @revenexx/cover — no Tag Manager module needed for this import
import { createStorefrontEvents } from '@revenexx/tag-manager-nuxt/events'

const events = createStorefrontEvents({
  context: () => ({ market, locale, currency, page: { path: route.path, type }, customer: { authenticated, b2b } }),
  callHook: (name, envelope) => nuxtApp.callHook(name, envelope),   // → Nuxt modules
  validate: import.meta.dev,                                          // dev: invalid envelopes are dropped + logged
})
events.emit('add_to_cart', { ecommerce: { items } })
// → nuxtApp.callHook('revenexx:event', envelope)
// → window.dispatchEvent(new CustomEvent('revenexx:event', { detail: envelope }))  (theme extensions, ADR-0111)
```

The subpath imports nothing from Nuxt or Vue and has no side effect, which a test asserts.

## Emission points in `@revenexx/cover` (read-only survey, 2026-10-03)

Paths are relative to `cover/packages/`. Line numbers are approximate. None of this is wired
yet — it is RAD-183. Today cover contains no tracking code at all; the only mention is the
comment in `cover-theme/app/composables/useBlokkliPreview.ts:2` that analytics must
early-return when `isPreview.value` is true. Every emission below must honour it: the blökkli
editor shells call `cart.addItem` to seed sample carts
(`cover-theme/app/components/blokkli/cart/cart.vue:54`, `checkout/checkout.vue:74`,
`checkout/confirmation/index.vue:52`).

| Event | Where | Notes |
| --- | --- | --- |
| `page_view` | new client plugin `cover/app/plugins/storefront-events.client.ts` (pattern: `auth-init.client.ts`), `router.afterEach` / `page:finish` | Pages are blökkli-authored; the router hook is the only uniform point. Skip `/admin/**`, `/preview/**`. |
| `view_item_list` | `cover/app/composables/useProductListing.ts` ~:200 (watch on `products`), called from `useCategoryListing.ts:17` | `list_id` = `category:<categorySlug>[/<subcategorySlug>]`; prices arrive later via offers. |
| `search` | `cover/app/composables/useSearchListing.ts:24` (query :34, listing :56) | Watch `(query, found)`, not keystrokes; skip `q=*` (catalog). |
| `select_item` | `cover/app/components/product/card/Compact.vue:64` and `:85` | List id/index must be provided by the listing (`cover-theme/app/composables/useListingContext.ts`). |
| `view_item` | page `cover-theme/app/pages/category/[category]/[...rest].vue:35` after `ready()` (data: `cover/app/composables/useProduct.ts:12`, offer :60) | Not in the composable: `product_swiper` also calls it. Brand = `manufacturer`. |
| `add_to_cart` | `cover/app/composables/useCartStore.ts:267` `addItem` returns boolean → pinia `cart.$onAction(({ name, args, after }) => after(ok => ok && emit(…)))` in the new plugin | Emit only when `after` sees `true` (AC-2). Quantity >1 on the detail page arrives as `addItem` + `updateQuantityByKey` (`ProductDetailAddToCart.vue:99/:118`) — diff quantities. |
| `remove_from_cart` | `useCartStore.ts:308` `removeItem`, `:315` `updateQuantity` (down), `:346` `removeByKeys`, `:355` `updateQuantityByKey` (down) via the same `$onAction` | Never `clearCart` (`:333`) — it runs after checkout, login, logout and quote requests. |
| `view_cart` | `cover-theme/app/pages/cart.vue` / shell `cover-theme/app/components/blokkli/cart/cart.vue` | Totals in `useCartStore`. |
| `begin_checkout` | shell `cover-theme/app/components/blokkli/checkout/checkout.vue:30` on mount | `useCheckoutOnePage` (`cover/app/composables/useCheckoutOnePage.ts:54`) is shared state — do not emit inside it. |
| `add_shipping_info` | `cover/app/components/checkout/onepage/CheckoutDeliverySection.vue:147` | Or a watch on `form.deliveryMethod`. |
| `add_payment_info` | `cover/app/components/checkout/onepage/CheckoutPaymentSection.vue` ~:87 `selectMethod` | Not the auto-default at :68/:70. |
| `purchase` | capture items in `useCheckoutOnePage.ts:314` `submitOrder` before `cart.clearCart()` (:352); emit on `cover-theme/app/pages/checkout/confirmation.vue` with data from `cover/app/composables/useCheckoutConfirmation.ts:11` | `transaction_id` = `orderId`. The recap lacks tax/shipping/subtotal — extend it from `AccountOrder` (`cover/app/interfaces/account/order-list.ts:33`). `orderNumber` there is the buyer's PO, not the order id. Not for `type=approval|requisition`. Dedupe is the emitter's. |
| `request_quote` | `cover/app/composables/useAccountQuotes.ts:74` `useQuoteRequest().request()` (:77) after success | Caller: `cover/app/components/cart/quote/CartQuoteRequestModal.vue:48`. |
| `add_to_orderlist` | `cover/app/components/cart/actions/CartSaveToListModal.vue:81` `save()` (PUT :88 / POST :96) | |
| `punchout_transfer` | `cover/app/pages/punchout/transfer.vue` `onMounted` ~:50, before `form.submit()` ~:66 | Skip when `replayed` or a back-channel transfer. `protocol` from `usePunchoutVisit`. |
| `form_submit` | `cover/app/components/RevenexxForm.vue:186` `onSubmit`, success branch ~:205 | `form_code` = `props.slug`; never field values. |
| `login` | `cover/app/composables/useAuthStore.ts:115` `login()`, `:167` `confirmSignInMail` | `method` password / magic_link / otp. |
| `sign_up` | `useAuthStore.ts:95` `register()` | |

Data gaps the emission work has to close: `CartItem` (`cover/app/interfaces/cart-item.ts:11`)
has no brand and only category slugs, and one `price` whose basis depends on
`useShopSettings().taxIncludedPrices` (net and gross have to be derived with `taxRate`);
`ProductList` (`cover/app/interfaces/product-list.ts:10`) has no brand; list id and position
are not passed into product cards.
