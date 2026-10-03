import type { StorefrontEventData, StorefrontEventEnvelope, StorefrontItem } from '../../src/runtime/events/types'
import type { StorefrontEventName } from '../../src/runtime/events/vocabulary'

export const ITEM: StorefrontItem = {
  sku: 'LS-B16-1P',
  name: 'Leitungsschutzschalter B16 1-polig',
  brand: 'Hager',
  category_path: ['Installation', 'Schutzgeräte'],
  price_net: 4.18,
  price_gross: 4.97,
  quantity: 10,
  list_position: 3,
}

export const CONTEXT = {
  market: 'de',
  locale: 'de-DE',
  currency: 'EUR',
  page: { path: '/p/schuetz-ls-16a', type: 'product' as const },
  customer: { authenticated: true, b2b: true },
}

/** The event-specific part of one valid envelope per event in vocabulary v1. */
export const DATA: Record<StorefrontEventName, StorefrontEventData> = {
  page_view: { page: { path: '/', type: 'home' } },
  view_item_list: { ecommerce: { list_id: 'category:installation/schutzgeraete', list_name: 'Schutzgeräte', items: [ITEM] } },
  search: { search: { search_term: 'leitungsschutzschalter', results_count: 42 } },
  select_item: { ecommerce: { list_id: 'search', items: [ITEM] } },
  view_item: { ecommerce: { items: [ITEM] } },
  add_to_cart: { ecommerce: { value_net: 41.8, value_gross: 49.7, items: [ITEM] } },
  remove_from_cart: { ecommerce: { items: [{ ...ITEM, quantity: 2 }] } },
  view_cart: { ecommerce: { items: [] } },
  begin_checkout: { ecommerce: { items: [ITEM] } },
  add_shipping_info: { ecommerce: { shipping_tier: 'standard', items: [ITEM] } },
  add_payment_info: { ecommerce: { payment_type: 'invoice', items: [ITEM] } },
  purchase: { ecommerce: { transaction_id: 'ORD-000123', value_net: 41.8, value_gross: 49.74, tax: 7.94, shipping: 0, items: [ITEM] } },
  request_quote: { ecommerce: { items: [ITEM] } },
  add_to_orderlist: { ecommerce: { items: [ITEM] } },
  punchout_transfer: { ecommerce: { value_net: 41.8, value_gross: 49.74, items: [ITEM] }, punchout: { protocol: 'oci' } },
  form_submit: { form: { form_code: 'kontakt', outcome: 'accepted' } },
  login: { auth: { method: 'password' } },
  sign_up: { auth: { method: 'magic_link' } },
}

let n = 0
export function envelope<E extends StorefrontEventName>(event: E, overrides: Partial<StorefrontEventEnvelope> = {}): StorefrontEventEnvelope<E> {
  n += 1
  const data = DATA[event]
  return {
    schema: 'storefront-events/1',
    event,
    event_id: event === 'purchase' ? 'ORD-000123' : `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    occurred_at: '2026-10-03T09:12:44.120Z',
    market: CONTEXT.market,
    locale: CONTEXT.locale,
    currency: CONTEXT.currency,
    page: data.page ?? CONTEXT.page,
    customer: CONTEXT.customer,
    ...(data.ecommerce ? { ecommerce: structuredClone(data.ecommerce) } : {}),
    ...(data.search ? { search: { ...data.search } } : {}),
    ...(data.form ? { form: data.form } : {}),
    ...(data.auth ? { auth: data.auth } : {}),
    ...(data.punchout ? { punchout: data.punchout } : {}),
    ...overrides,
  } as StorefrontEventEnvelope<E>
}
