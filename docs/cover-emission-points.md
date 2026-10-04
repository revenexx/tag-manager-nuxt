# Emission points in `@revenexx/cover`

Where the revenexx reference storefront (`@revenexx/cover`) has to emit each theme event. This
is an internal working note for wiring the contract into cover (RAD-183), kept here because it
was surveyed together with the contract. It is not part of the published package. The contract
itself is [`contract/README.md`](../contract/README.md).

Paths are relative to `cover/packages/`. Line numbers are approximate. None of this is wired
yet — it is RAD-183. Today cover contains no tracking code at all; the only mention is the
comment in `cover-theme/app/composables/useBlokkliPreview.ts:2` that analytics must
early-return when `isPreview.value` is true. Every emission below must honour it: the blökkli
editor shells call `cart.addItem` to seed sample carts
(`cover-theme/app/components/blokkli/cart/cart.vue:54`, `checkout/checkout.vue:74`,
`checkout/confirmation/index.vue:52`).

| Event | Where | Notes |
| --- | --- | --- |
| `page_view` | new client plugin `cover/app/plugins/theme-events.client.ts` (pattern: `auth-init.client.ts`), `router.afterEach` / `page:finish` | Pages are blökkli-authored; the router hook is the only uniform point. Skip `/admin/**`, `/preview/**`. |
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
