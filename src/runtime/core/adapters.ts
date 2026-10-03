/**
 * Vendor adapters: turn one theme event plus one event-map entry into the
 * vendor's own call. Each adapter writes to the vendor's global the way the
 * vendor's snippet documents it, so a call made before the script finished
 * loading lands in the vendor's own queue where one exists.
 *
 * No adapter reads anything about the visitor beyond the envelope, and the
 * envelope carries no personal data (theme-events/1). Adapters that the
 * vendor would let us `identify` a person with never do.
 */
import type { ThemeEventEnvelope, ThemeEventItem } from '../events/types'
import type { EventMapEntry, PriceBasis } from './types'

export interface AdapterContext {
  w: Record<string, any>
  basis: PriceBasis
  dataLayerName: string
  /** Static params from the event map, variables already substituted. */
  params: Record<string, unknown>
  /** Per-tag scratch state (e.g. "first page view seen"). */
  state: Record<string, unknown>
}

export type VendorAdapter = (entry: EventMapEntry, envelope: ThemeEventEnvelope, ctx: AdapterContext) => void

const round2 = (n: number): number => Math.round(n * 100) / 100

/** An item's unit price in the configured basis, or undefined when unknown. */
export function unitPrice(item: ThemeEventItem, basis: PriceBasis): number | undefined {
  const v = basis === 'gross' ? item.price_gross : item.price_net
  return typeof v === 'number' ? v : undefined
}

/** The event's value in the configured basis; falls back to summing the lines. */
export function eventValue(envelope: ThemeEventEnvelope, basis: PriceBasis): number | undefined {
  const e = envelope.ecommerce
  if (!e) return undefined
  const direct = basis === 'gross' ? e.value_gross : e.value_net
  if (typeof direct === 'number') return direct
  if (!e.items?.length) return undefined
  let sum = 0
  for (const item of e.items) {
    const p = unitPrice(item, basis)
    if (p === undefined) return undefined
    sum += p * item.quantity
  }
  return round2(sum)
}

/** GA4's item shape — also what GTM's ecommerce dataLayer expects. */
export function ga4Item(item: ThemeEventItem, basis: PriceBasis): Record<string, unknown> {
  const out: Record<string, unknown> = { item_id: item.sku, item_name: item.name, quantity: item.quantity }
  if (item.brand) out.item_brand = item.brand
  if (item.variant) out.item_variant = item.variant
  const price = unitPrice(item, basis)
  if (price !== undefined) out.price = price
  if (item.list_position !== undefined) out.index = item.list_position
  if (item.list_id) out.item_list_id = item.list_id
  ;(item.category_path ?? []).slice(0, 5).forEach((c, i) => {
    out[i === 0 ? 'item_category' : `item_category${i + 1}`] = c
  })
  return out
}

/** The GA4 parameter object for one envelope (used by gtag and the dataLayer). */
export function ga4Params(envelope: ThemeEventEnvelope, basis: PriceBasis): Record<string, unknown> {
  const e = envelope.ecommerce
  const out: Record<string, unknown> = {}
  if (e) {
    out.currency = envelope.currency
    const value = eventValue(envelope, basis)
    if (value !== undefined) out.value = value
    if (e.items) out.items = e.items.map(i => ga4Item(i, basis))
    if (e.transaction_id) out.transaction_id = e.transaction_id
    if (e.tax !== undefined) out.tax = e.tax
    if (e.shipping !== undefined) out.shipping = e.shipping
    if (e.coupon) out.coupon = e.coupon
    if (e.list_id) out.item_list_id = e.list_id
    if (e.list_name) out.item_list_name = e.list_name
    if (e.shipping_tier) out.shipping_tier = e.shipping_tier
    if (e.payment_type) out.payment_type = e.payment_type
  }
  if (envelope.search) out.search_term = envelope.search.search_term
  if (envelope.auth) out.method = envelope.auth.method
  if (envelope.form) out.form_code = envelope.form.form_code
  if (envelope.punchout) out.punchout = true
  return out
}

/** Push one GA4-format event to a dataLayer, clearing the previous ecommerce object first. */
export function pushToDataLayer(w: Record<string, any>, dataLayerName: string, eventName: string, envelope: ThemeEventEnvelope, basis: PriceBasis, extra: Record<string, unknown> = {}): void {
  const dl = (w[dataLayerName] = w[dataLayerName] || [])
  const params = ga4Params(envelope, basis)
  const { currency, value, items, transaction_id, tax, shipping, coupon, item_list_id, item_list_name, shipping_tier, payment_type, ...rest } = params
  const ecommerce = Object.fromEntries(Object.entries({ currency, value, items, transaction_id, tax, shipping, coupon, item_list_id, item_list_name, shipping_tier, payment_type }).filter(([, v]) => v !== undefined))
  if (Object.keys(ecommerce).length) {
    // GA4 requires the previous ecommerce object to be cleared before every commerce event.
    dl.push({ ecommerce: null })
    dl.push({ event: eventName, ecommerce, ...rest, ...extra })
  }
  else {
    dl.push({ event: eventName, ...rest, ...extra })
  }
}

// ---- GA4 / GTM -------------------------------------------------------------

const googleAnalytics: VendorAdapter = (entry, envelope, ctx) => {
  const gtag = ctx.w.gtag
  if (typeof gtag !== 'function') return
  gtag('event', entry.name, { ...ga4Params(envelope, ctx.basis), ...ctx.params })
}

const googleTagManager: VendorAdapter = (entry, envelope, ctx) => {
  pushToDataLayer(ctx.w, ctx.dataLayerName, entry.name, envelope, ctx.basis, ctx.params)
}

// ---- Meta, TikTok, Bing, LinkedIn -----------------------------------------

const META_STANDARD = new Set(['PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead', 'CompleteRegistration', 'Contact', 'SubmitApplication'])

function contentParams(envelope: ThemeEventEnvelope, basis: PriceBasis): Record<string, unknown> {
  const items = envelope.ecommerce?.items ?? []
  const out: Record<string, unknown> = {}
  if (items.length) {
    out.content_ids = items.map(i => i.sku)
    out.content_type = 'product'
    out.contents = items.map(i => ({ id: i.sku, quantity: i.quantity, ...(unitPrice(i, basis) !== undefined ? { item_price: unitPrice(i, basis) } : {}) }))
    out.num_items = items.reduce((n, i) => n + i.quantity, 0)
  }
  const value = eventValue(envelope, basis)
  if (value !== undefined) {
    out.value = value
    out.currency = envelope.currency
  }
  if (envelope.search) out.search_string = envelope.search.search_term
  return out
}

const metaPixel: VendorAdapter = (entry, envelope, ctx) => {
  const fbq = ctx.w.fbq
  if (typeof fbq !== 'function') return
  const params = { ...contentParams(envelope, ctx.basis), ...ctx.params }
  const options = envelope.event === 'purchase' ? { eventID: envelope.event_id } : undefined
  fbq(META_STANDARD.has(entry.name) ? 'track' : 'trackCustom', entry.name, params, ...(options ? [options] : []))
}

const tiktokPixel: VendorAdapter = (entry, envelope, ctx) => {
  const ttq = ctx.w.ttq
  if (!ttq || typeof ttq.track !== 'function') return
  const items = envelope.ecommerce?.items ?? []
  const params: Record<string, unknown> = { ...ctx.params }
  if (items.length) {
    params.content_type = 'product'
    params.contents = items.map(i => ({ content_id: i.sku, content_name: i.name, quantity: i.quantity, ...(unitPrice(i, ctx.basis) !== undefined ? { price: unitPrice(i, ctx.basis) } : {}) }))
  }
  const value = eventValue(envelope, ctx.basis)
  if (value !== undefined) {
    params.value = value
    params.currency = envelope.currency
  }
  if (envelope.search) params.query = envelope.search.search_term
  ttq.track(entry.name, params, { event_id: envelope.event_id })
}

const bingUet: VendorAdapter = (entry, envelope, ctx) => {
  const uetq = (ctx.w.uetq = ctx.w.uetq || [])
  const params: Record<string, unknown> = { ...ctx.params }
  const value = eventValue(envelope, ctx.basis)
  if (value !== undefined) {
    params.revenue_value = value
    params.currency = envelope.currency
  }
  const items = envelope.ecommerce?.items
  if (items?.length) params.ecomm_prodid = items.map(i => i.sku)
  if (envelope.search) params.search_term = envelope.search.search_term
  uetq.push('event', entry.name, params)
}

/** LinkedIn tracks conversions by id: the event-map `name` IS the conversion id. */
const linkedinInsight: VendorAdapter = (entry, _envelope, ctx) => {
  const lintrk = ctx.w.lintrk
  const id = Number(entry.name)
  if (typeof lintrk !== 'function' || !Number.isFinite(id)) return
  lintrk('track', { conversion_id: id })
}

// ---- Matomo, Hotjar, Clarity ----------------------------------------------

const matomoAnalytics: VendorAdapter = (entry, envelope, ctx) => {
  const paq = (ctx.w._paq = ctx.w._paq || [])
  const items = envelope.ecommerce?.items ?? []
  const value = eventValue(envelope, ctx.basis)
  switch (entry.name) {
    case 'trackSiteSearch':
      paq.push(['trackSiteSearch', envelope.search?.search_term ?? '', false, envelope.search?.results_count ?? false])
      return
    case 'setEcommerceView': {
      const item = items[0]
      if (!item) return
      paq.push(['setEcommerceView', item.sku, item.name, item.category_path ?? [], unitPrice(item, ctx.basis)])
      paq.push(['trackPageView'])
      return
    }
    case 'trackEcommerceCartUpdate':
      for (const item of items) paq.push(['addEcommerceItem', item.sku, item.name, item.category_path ?? [], unitPrice(item, ctx.basis), item.quantity])
      paq.push(['trackEcommerceCartUpdate', value ?? 0])
      return
    case 'trackEcommerceOrder': {
      for (const item of items) paq.push(['addEcommerceItem', item.sku, item.name, item.category_path ?? [], unitPrice(item, ctx.basis), item.quantity])
      const e = envelope.ecommerce ?? {}
      paq.push(['trackEcommerceOrder', e.transaction_id ?? envelope.event_id, value ?? 0, value ?? 0, e.tax ?? 0, e.shipping ?? 0, false])
      return
    }
    default:
      paq.push(['trackEvent', String(ctx.params.category ?? 'storefront'), entry.name, String(ctx.params.label ?? envelope.event), value])
  }
}

const hotjar: VendorAdapter = (entry, _e, ctx) => {
  if (typeof ctx.w.hj === 'function') ctx.w.hj('event', entry.name)
}

const clarity: VendorAdapter = (entry, _e, ctx) => {
  if (typeof ctx.w.clarity === 'function') ctx.w.clarity('event', entry.name)
}

// ---- Support widgets --------------------------------------------------------

function widgetMeta(envelope: ThemeEventEnvelope, basis: PriceBasis, params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params }
  const value = eventValue(envelope, basis)
  if (value !== undefined) {
    out.value = value
    out.currency = envelope.currency
  }
  const items = envelope.ecommerce?.items
  if (items?.length) out.items_count = items.length
  return out
}

const intercom: VendorAdapter = (entry, envelope, ctx) => {
  if (typeof ctx.w.Intercom === 'function') ctx.w.Intercom('trackEvent', entry.name, widgetMeta(envelope, ctx.basis, ctx.params))
}

const crisp: VendorAdapter = (entry, envelope, ctx) => {
  const crispQ = (ctx.w.$crisp = ctx.w.$crisp || [])
  crispQ.push(['set', 'session:event', [[[entry.name, widgetMeta(envelope, ctx.basis, ctx.params)]]]])
}

const tawkTo: VendorAdapter = (entry, envelope, ctx) => {
  const api = ctx.w.Tawk_API
  if (api && typeof api.addEvent === 'function') api.addEvent(entry.name, widgetMeta(envelope, ctx.basis, ctx.params), () => {})
}

// ---- etracker (etCommerce) --------------------------------------------------

/** etracker wants prices as dot-decimal strings, at most 20 chars. */
const etPrice = (n: number | undefined): string => (n === undefined ? '0' : n.toFixed(2))
const cut = (s: string | undefined, n: number): string => String(s ?? '').slice(0, n)

export function etrackerProduct(item: ThemeEventItem, currency: string, basis: PriceBasis): Record<string, unknown> {
  const product: Record<string, unknown> = {
    id: cut(item.sku, 50),
    name: cut(item.name, 255),
    price: etPrice(unitPrice(item, basis)),
    currency,
    category: (item.category_path ?? []).slice(0, 4).map(c => cut(c, 50)),
  }
  if (item.variant) product.variants = { variant: cut(item.variant, 50) }
  return product
}

/**
 * etCommerce calls go through `_etrackerOnReady`: etracker documents that a
 * call made before e.js loaded is lost otherwise, and the queue is how its own
 * snippet defers work.
 */
function etQueue(w: Record<string, any>, fn: () => void): void {
  w._etrackerOnReady = typeof w._etrackerOnReady === 'undefined' ? [] : w._etrackerOnReady
  w._etrackerOnReady.push(fn)
}

const etracker: VendorAdapter = (entry, envelope, ctx) => {
  const { w, basis } = ctx
  const items = envelope.ecommerce?.items ?? []
  const currency = envelope.currency
  const send = (...args: unknown[]) => etQueue(w, () => w.etCommerce?.sendEvent(...args))
  switch (entry.name) {
    case 'viewProduct':
      if (items[0]) send('viewProduct', etrackerProduct(items[0], currency, basis))
      return
    case 'viewProductList': {
      const listType = envelope.event === 'search' ? 'searchlist' : envelope.event === 'view_item_list' ? 'categorylist' : 'genericlist'
      send('viewProductList', { listType, products: items.map(i => etrackerProduct(i, currency, basis)) })
      return
    }
    case 'insertToBasket':
    case 'removeFromBasket':
    case 'insertToWatchlist':
    case 'removeFromWatchlist':
      for (const item of items) send(entry.name, etrackerProduct(item, currency, basis), Math.min(65535, Math.max(0, Math.round(item.quantity))))
      return
    case 'order': {
      const e = envelope.ecommerce ?? {}
      // A quote request and a punchout handover are leads: no money has moved yet.
      const status = typeof ctx.params.status === 'string'
        ? ctx.params.status
        : (envelope.event === 'purchase' ? 'sale' : 'lead')
      const order: Record<string, unknown> = {
        orderNumber: cut(e.transaction_id ?? envelope.event_id, 50),
        status,
        orderPrice: etPrice(eventValue(envelope, basis)),
        currency,
        basket: {
          id: cut(e.transaction_id ?? envelope.event_id, 50),
          products: items.map(i => ({ product: etrackerProduct(i, currency, basis), quantity: Math.min(65535, Math.max(0, Math.round(i.quantity))) })),
        },
      }
      if (e.coupon) order.coupon = cut(e.coupon, 50)
      if (e.shipping_tier) order.deliveryConditions = cut(e.shipping_tier, 255)
      if (e.payment_type) order.paymentConditions = cut(e.payment_type, 255)
      if (envelope.customer?.b2b) order.customerGroup = 'b2b'
      send('order', order)
      return
    }
    default:
      // Anything else is a user-defined event: object = the mapped name, category = the theme event.
      etQueue(w, () => {
        const Ctor = w.et_UserDefinedEvent
        if (w._etracker && typeof Ctor === 'function') w._etracker.sendEvent(new Ctor(entry.name, envelope.event, String(ctx.params.action ?? ''), String(ctx.params.type ?? '')))
      })
  }
}

// ---- HubSpot ----------------------------------------------------------------

const hubspot: VendorAdapter = (entry, envelope, ctx) => {
  const hsq = (ctx.w._hsq = ctx.w._hsq || [])
  if (entry.name === 'trackPageView') {
    // The loader tracks the first page by itself; only SPA navigations after it are pushed.
    if (!ctx.state.firstPageSeen) {
      ctx.state.firstPageSeen = true
      return
    }
    hsq.push(['setPath', envelope.page.path])
    hsq.push(['trackPageView'])
    return
  }
  hsq.push(['trackCustomBehavioralEvent', { name: entry.name, properties: widgetMeta(envelope, ctx.basis, ctx.params) }])
}

export const ADAPTERS: Record<string, VendorAdapter> = {
  googleAnalytics,
  googleTagManager,
  metaPixel,
  tiktokPixel,
  bingUet,
  linkedinInsight,
  matomoAnalytics,
  hotjar,
  clarity,
  intercom,
  crisp,
  tawkTo,
  etracker,
  hubspot,
}
