/**
 * `createStorefrontEvents()` — the framework-free emitter of the storefront
 * event contract.
 *
 * It imports nothing from Nuxt or Vue and has no side effect at import time, so
 * a theme (@revenexx/cover) can emit through it without installing the Tag
 * Manager module: hand it `nuxtApp.callHook` and it speaks to Nuxt modules,
 * and it always dispatches the DOM event for theme extensions (ADR-0111).
 *
 *   const events = createStorefrontEvents({
 *     context: () => ({ market, locale, currency, page, customer }),
 *     callHook: (name, envelope) => nuxtApp.callHook(name, envelope),
 *     validate: import.meta.dev,
 *   })
 *   events.emit('add_to_cart', { ecommerce: { items } })
 */
import type { StorefrontEventContext, StorefrontEventData, StorefrontEventEnvelope } from './types'
import { validateStorefrontEvent } from './validate'
import { STOREFRONT_EVENTS_SCHEMA, STOREFRONT_EVENT_DOM, STOREFRONT_EVENT_HOOK } from './vocabulary'
import type { StorefrontEventName } from './vocabulary'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface StorefrontEventsOptions {
  /** Read on every emit: market, locale, currency, page and the two visitor booleans. */
  context: () => StorefrontEventContext
  /** Usually `(name, e) => nuxtApp.callHook(name, e)`. Omit outside Nuxt. */
  callHook?: (name: typeof STOREFRONT_EVENT_HOOK, envelope: StorefrontEventEnvelope) => unknown
  /** Where the DOM event is dispatched. Defaults to `window` in a browser, none on the server. */
  target?: { dispatchEvent(event: Event): boolean } | null
  /** Validate every envelope against the contract; invalid ones are not emitted. Turn on in dev. */
  validate?: boolean
  /** What to do with an invalid envelope when `validate` is on. Default `warn` (log and drop). */
  onInvalid?: 'warn' | 'throw'
  /** Purchase dedupe across reloads. Defaults to `sessionStorage` when available. */
  storage?: StorageLike | null
  uuid?: () => string
  now?: () => Date
  logger?: Pick<Console, 'warn'>
}

export interface StorefrontEvents {
  /**
   * Emit one event. Returns the envelope that went out, or `null` when nothing
   * was emitted (an invalid envelope in validate mode, or a purchase already
   * emitted for that transaction).
   */
  emit<E extends StorefrontEventName>(event: E, data?: StorefrontEventData): StorefrontEventEnvelope<E> | null
}

const PURCHASE_KEY = 'rvx_se_purchase:'
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/
// Seven or more digits, optionally separated — a phone or a customer number.
const NUMBERISH_RE = /(?:\+?\d[\s\-/().]*){7,}/

function defaultUuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c?.randomUUID) return c.randomUUID()
  // RFC 4122 v4 from Math.random — only reached in very old runtimes.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.random() * 16 | 0
    return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function defaultStorage(): StorageLike | null {
  try {
    const s = (globalThis as { sessionStorage?: Storage }).sessionStorage
    if (!s) return null
    const probe = '__rvx_se__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  }
  catch {
    return null
  }
}

function defaultTarget(): { dispatchEvent(event: Event): boolean } | null {
  const w = (globalThis as { window?: Window }).window
  return w && typeof w.dispatchEvent === 'function' ? w : null
}

/**
 * The privacy pass that runs on EVERY envelope, validate mode or not: a path
 * loses its query string, and a search term that looks like an address or a
 * phone number is replaced. Both are places a visitor's own typing reaches the
 * envelope, which is why they are cleaned rather than merely validated.
 */
export function scrubStorefrontEvent<T extends StorefrontEventEnvelope>(envelope: T): T {
  if (envelope.page?.path) {
    envelope.page.path = envelope.page.path.split(/[?#]/)[0] || '/'
  }
  if (envelope.search && typeof envelope.search.search_term === 'string') {
    const term = envelope.search.search_term
    if (EMAIL_RE.test(term) || NUMBERISH_RE.test(term)) envelope.search.search_term = '[redacted]'
  }
  return envelope
}

export function createStorefrontEvents(options: StorefrontEventsOptions): StorefrontEvents {
  const uuid = options.uuid ?? defaultUuid
  const now = options.now ?? (() => new Date())
  const logger = options.logger ?? console
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const target = options.target === undefined ? defaultTarget() : options.target
  // Fallback for purchase dedupe when no storage is reachable (private mode).
  const seenInMemory = new Set<string>()

  const purchaseSeen = (id: string): boolean => {
    if (seenInMemory.has(id)) return true
    try {
      return storage?.getItem(PURCHASE_KEY + id) != null
    }
    catch {
      return false
    }
  }
  const markPurchase = (id: string): void => {
    seenInMemory.add(id)
    try {
      storage?.setItem(PURCHASE_KEY + id, String(Date.now()))
    }
    catch {
      // Storage full or blocked: the in-memory set still covers this page.
    }
  }

  function emit<E extends StorefrontEventName>(event: E, data: StorefrontEventData = {}): StorefrontEventEnvelope<E> | null {
    const ctx = options.context()
    const envelope = {
      schema: STOREFRONT_EVENTS_SCHEMA,
      event,
      event_id: uuid(),
      occurred_at: now().toISOString(),
      market: ctx.market,
      locale: ctx.locale,
      currency: ctx.currency,
      page: { ...(data.page ?? ctx.page) },
      customer: { authenticated: Boolean(ctx.customer.authenticated), b2b: Boolean(ctx.customer.b2b) },
      ...(data.ecommerce ? { ecommerce: data.ecommerce } : {}),
      ...(data.search ? { search: { ...data.search } } : {}),
      ...(data.form ? { form: data.form } : {}),
      ...(data.auth ? { auth: data.auth } : {}),
      ...(data.punchout ? { punchout: data.punchout } : {}),
    } as StorefrontEventEnvelope<E>

    // purchase: the order number IS the event id, and an order is emitted once.
    let transactionId: string | null = null
    if (event === 'purchase') {
      transactionId = envelope.ecommerce?.transaction_id ?? null
      if (transactionId) {
        envelope.event_id = transactionId
        if (purchaseSeen(transactionId)) return null
      }
    }

    scrubStorefrontEvent(envelope)

    if (options.validate) {
      const errors = validateStorefrontEvent(envelope)
      if (errors.length) {
        const message = `[revenexx storefront-events] '${event}' not emitted:\n  ${errors.join('\n  ')}`
        if (options.onInvalid === 'throw') throw new TypeError(message)
        logger.warn(message)
        return null
      }
    }

    if (transactionId) markPurchase(transactionId)

    try {
      options.callHook?.(STOREFRONT_EVENT_HOOK, envelope)
    }
    catch (err) {
      logger.warn('[revenexx storefront-events] a hook listener failed', err)
    }
    if (target && typeof CustomEvent === 'function') {
      target.dispatchEvent(new CustomEvent(STOREFRONT_EVENT_DOM, { detail: envelope }))
    }
    return envelope
  }

  return { emit }
}
