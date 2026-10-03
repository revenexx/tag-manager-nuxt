/**
 * Vocabulary v1 of the storefront event contract.
 *
 * The canonical definition is `contract/storefront-events.schema.json`; this
 * file restates the enumerations for code that cannot read JSON at runtime.
 * `test/contract.test.ts` fails the moment the two disagree.
 */

export const STOREFRONT_EVENTS_SCHEMA = 'storefront-events/1' as const
export const STOREFRONT_EVENTS_SCHEMA_ID = 'https://schemas.revenexx.com/storefront-events.schema.json' as const

/** Transport names: the Nuxt hook and the DOM event share one name. */
export const STOREFRONT_EVENT_HOOK = 'revenexx:event' as const
export const STOREFRONT_EVENT_DOM = 'revenexx:event' as const

export const STOREFRONT_EVENT_NAMES = [
  'page_view',
  'view_item_list',
  'search',
  'select_item',
  'view_item',
  'add_to_cart',
  'remove_from_cart',
  'view_cart',
  'begin_checkout',
  'add_shipping_info',
  'add_payment_info',
  'purchase',
  'request_quote',
  'add_to_orderlist',
  'punchout_transfer',
  'form_submit',
  'login',
  'sign_up',
] as const

export type StorefrontEventName = typeof STOREFRONT_EVENT_NAMES[number]

/** The B2B events GA4 has no name for. */
export const B2B_EVENT_NAMES = ['request_quote', 'add_to_orderlist', 'punchout_transfer'] as const

export const PAGE_TYPES = [
  'home', 'category', 'search', 'product', 'cart', 'checkout', 'confirmation',
  'account', 'quote', 'orderlist', 'punchout', 'login', 'register', 'content', 'other',
] as const
export type PageType = typeof PAGE_TYPES[number]

export const AUTH_METHODS = ['password', 'magic_link', 'otp', 'sso', 'punchout', 'other'] as const
export type AuthMethod = typeof AUTH_METHODS[number]

export const PUNCHOUT_PROTOCOLS = ['oci', 'cxml'] as const
export type PunchoutProtocol = typeof PUNCHOUT_PROTOCOLS[number]

/**
 * Field names that must never appear anywhere in an envelope. The schema
 * already refuses them (every object is closed); this list is what the
 * validator names when it refuses one, and what the docs point at.
 */
export const FORBIDDEN_FIELDS = [
  'email', 'e_mail', 'mail', 'name_first', 'first_name', 'last_name', 'full_name',
  'phone', 'telephone', 'mobile', 'customer_number', 'customer_id', 'contact_id',
  'organization_id', 'user_id', 'company', 'company_name', 'street', 'address',
  'postal_code', 'zip', 'city', 'ip', 'ip_address', 'birthdate', 'vat_id',
] as const

/** Which `ecommerce` fields each commerce event requires, per the schema's allOf. */
export const ECOMMERCE_REQUIREMENTS: Partial<Record<StorefrontEventName, { required: readonly string[], minItems: number, maxItems?: number }>> = {
  view_item_list: { required: ['list_id', 'items'], minItems: 1 },
  select_item: { required: ['items'], minItems: 1, maxItems: 1 },
  view_item: { required: ['items'], minItems: 1, maxItems: 1 },
  add_to_cart: { required: ['items'], minItems: 1 },
  remove_from_cart: { required: ['items'], minItems: 1 },
  view_cart: { required: ['items'], minItems: 0 },
  begin_checkout: { required: ['items'], minItems: 1 },
  add_shipping_info: { required: ['shipping_tier', 'items'], minItems: 1 },
  add_payment_info: { required: ['payment_type', 'items'], minItems: 1 },
  purchase: { required: ['transaction_id', 'value_net', 'value_gross', 'tax', 'shipping', 'items'], minItems: 1 },
  request_quote: { required: ['items'], minItems: 1 },
  add_to_orderlist: { required: ['items'], minItems: 1 },
  punchout_transfer: { required: ['value_net', 'value_gross', 'items'], minItems: 1 },
}

/** Which non-commerce block each event requires. */
export const BLOCK_REQUIREMENTS: Partial<Record<StorefrontEventName, 'search' | 'form' | 'auth' | 'punchout'>> = {
  search: 'search',
  form_submit: 'form',
  login: 'auth',
  sign_up: 'auth',
  punchout_transfer: 'punchout',
}
