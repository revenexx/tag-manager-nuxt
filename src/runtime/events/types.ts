/**
 * TypeScript shape of `contract/storefront-events.schema.json` (storefront-events/1).
 * Handwritten from the schema; `test/contract.test.ts` checks the enumerations
 * and the required sets against the JSON so the two cannot drift silently.
 */
import type { AuthMethod, PageType, PunchoutProtocol, StorefrontEventName } from './vocabulary'

export interface StorefrontItem {
  /** Article number; the product id in every vendor mapping. */
  sku: string
  name: string
  brand?: string
  /** Category labels root → leaf, at most five. */
  category_path?: string[]
  variant?: string
  /** Unit price before tax; null when the storefront does not know it (on request). */
  price_net?: number | null
  /** Unit price including tax; null when unknown. */
  price_gross?: number | null
  /** Units — a number, cable is sold by the metre. */
  quantity: number
  /** 1-based position in the list it was shown in. */
  list_position?: number
  list_id?: string
}

export interface StorefrontEcommerce {
  items?: StorefrontItem[]
  value_net?: number | null
  value_gross?: number | null
  tax?: number
  shipping?: number
  /** The order number the platform issued — never the buyer's PO reference. */
  transaction_id?: string
  coupon?: string
  list_id?: string
  list_name?: string
  shipping_tier?: string
  payment_type?: string
}

export interface StorefrontPage {
  /** Route path without query string or fragment. */
  path: string
  type: PageType
}

/** Everything the contract may say about the visitor. Nothing else, ever. */
export interface StorefrontCustomer {
  authenticated: boolean
  b2b: boolean
}

export interface StorefrontSearch { search_term: string, results_count: number }
export interface StorefrontForm { form_code: string, outcome?: 'accepted' | 'rejected' }
export interface StorefrontAuth { method: AuthMethod }
export interface StorefrontPunchout { protocol: PunchoutProtocol }

export interface StorefrontEventEnvelope<E extends StorefrontEventName = StorefrontEventName> {
  schema: 'storefront-events/1'
  event: E
  /** UUID v4; for `purchase` the transaction_id. */
  event_id: string
  occurred_at: string
  market: string
  locale: string
  currency: string
  page: StorefrontPage
  customer: StorefrontCustomer
  ecommerce?: StorefrontEcommerce
  search?: StorefrontSearch
  form?: StorefrontForm
  auth?: StorefrontAuth
  punchout?: StorefrontPunchout
}

/** What a caller passes to `emit()`: the event-specific part of the envelope. */
export type StorefrontEventData = Partial<Pick<StorefrontEventEnvelope, 'ecommerce' | 'search' | 'form' | 'auth' | 'punchout' | 'page'>>

/** The context the emitter stamps onto every envelope. */
export interface StorefrontEventContext {
  market: string
  locale: string
  currency: string
  page: StorefrontPage
  customer: StorefrontCustomer
}
