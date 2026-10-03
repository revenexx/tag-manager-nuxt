/**
 * A dependency-free validator for storefront-events/1.
 *
 * The schema is canonical; this is its executable twin for the browser, where
 * shipping a JSON-Schema engine to every visitor would cost more than the
 * check is worth. `test/contract.test.ts` runs every fixture through BOTH this
 * function and a real 2020-12 validator (ajv) and fails when they disagree, so
 * a rule added to the schema and forgotten here goes red.
 */
import {
  AUTH_METHODS,
  BLOCK_REQUIREMENTS,
  ECOMMERCE_REQUIREMENTS,
  FORBIDDEN_FIELDS,
  PAGE_TYPES,
  PUNCHOUT_PROTOCOLS,
  STOREFRONT_EVENTS_SCHEMA,
  STOREFRONT_EVENT_NAMES,
} from './vocabulary'
import type { StorefrontEventName } from './vocabulary'

type Json = Record<string, unknown>

const ENVELOPE_KEYS = ['schema', 'event', 'event_id', 'occurred_at', 'market', 'locale', 'currency', 'page', 'customer', 'ecommerce', 'search', 'form', 'auth', 'punchout']
const ENVELOPE_REQUIRED = ['schema', 'event', 'event_id', 'occurred_at', 'market', 'locale', 'currency', 'page', 'customer']
const ITEM_KEYS = ['sku', 'name', 'brand', 'category_path', 'variant', 'price_net', 'price_gross', 'quantity', 'list_position', 'list_id']
const ECOMMERCE_KEYS = ['items', 'value_net', 'value_gross', 'tax', 'shipping', 'transaction_id', 'coupon', 'list_id', 'list_name', 'shipping_tier', 'payment_type']
const MAX_MONEY = 1e12

const MARKET_RE = /^[a-z0-9][\w-]*$/
const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/
const CURRENCY_RE = /^[A-Z]{3}$/
const PATH_RE = /^\/[^?#]*$/
// RFC 3339 date-time, the subset `format: date-time` means.
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'

function closed(obj: Json, allowed: readonly string[], path: string, errors: string[]): void {
  for (const key of Object.keys(obj)) {
    if (allowed.includes(key)) continue
    const why = (FORBIDDEN_FIELDS as readonly string[]).includes(key) ? ' — personal data is forbidden by the contract' : ''
    errors.push(`${path}.${key}: not allowed${why}`)
  }
}

function str(obj: Json, key: string, path: string, errors: string[], opts: { required?: boolean, min?: number, max?: number, re?: RegExp } = {}): void {
  const v = obj[key]
  if (v === undefined) {
    if (opts.required) errors.push(`${path}.${key}: required`)
    return
  }
  if (!isString(v)) { errors.push(`${path}.${key}: must be a string`); return }
  if (opts.min !== undefined && v.length < opts.min) errors.push(`${path}.${key}: shorter than ${opts.min}`)
  if (opts.max !== undefined && v.length > opts.max) errors.push(`${path}.${key}: longer than ${opts.max}`)
  if (opts.re && !opts.re.test(v)) errors.push(`${path}.${key}: does not match ${opts.re}`)
}

function money(obj: Json, key: string, path: string, errors: string[], nullable: boolean): void {
  const v = obj[key]
  if (v === undefined) return
  if (v === null) {
    if (!nullable) errors.push(`${path}.${key}: must be a number`)
    return
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) { errors.push(`${path}.${key}: must be a number`); return }
  if (v < 0) errors.push(`${path}.${key}: must be >= 0`)
  if (v > MAX_MONEY) errors.push(`${path}.${key}: too large`)
}

function oneOf(obj: Json, key: string, values: readonly string[], path: string, errors: string[], required: boolean): void {
  const v = obj[key]
  if (v === undefined) {
    if (required) errors.push(`${path}.${key}: required`)
    return
  }
  if (!isString(v) || !values.includes(v)) errors.push(`${path}.${key}: must be one of ${values.join(', ')}`)
}

function validateItem(item: unknown, path: string, errors: string[]): void {
  if (!isObject(item)) { errors.push(`${path}: must be an object`); return }
  closed(item, ITEM_KEYS, path, errors)
  str(item, 'sku', path, errors, { required: true, min: 1, max: 128 })
  str(item, 'name', path, errors, { required: true, min: 1, max: 256 })
  str(item, 'brand', path, errors, { max: 128 })
  str(item, 'variant', path, errors, { max: 128 })
  str(item, 'list_id', path, errors, { max: 128 })
  if (item.category_path !== undefined) {
    if (!Array.isArray(item.category_path)) errors.push(`${path}.category_path: must be an array`)
    else {
      if (item.category_path.length > 5) errors.push(`${path}.category_path: more than 5 levels`)
      item.category_path.forEach((c, i) => {
        if (!isString(c) || c.length < 1 || c.length > 128) errors.push(`${path}.category_path[${i}]: must be a non-empty string up to 128`)
      })
    }
  }
  money(item, 'price_net', path, errors, true)
  money(item, 'price_gross', path, errors, true)
  const q = item.quantity
  if (q === undefined) errors.push(`${path}.quantity: required`)
  else if (typeof q !== 'number' || !Number.isFinite(q) || q <= 0 || q > 1e9) errors.push(`${path}.quantity: must be a number > 0`)
  const lp = item.list_position
  if (lp !== undefined && (typeof lp !== 'number' || !Number.isInteger(lp) || lp < 1)) errors.push(`${path}.list_position: must be an integer >= 1`)
}

function validateEcommerce(e: unknown, event: StorefrontEventName, errors: string[]): void {
  const path = 'ecommerce'
  if (!isObject(e)) { errors.push(`${path}: must be an object`); return }
  closed(e, ECOMMERCE_KEYS, path, errors)
  const strict = event === 'purchase'
  for (const k of ['value_net', 'value_gross']) money(e, k, path, errors, !strict)
  for (const k of ['tax', 'shipping']) money(e, k, path, errors, false)
  str(e, 'transaction_id', path, errors, { min: 1, max: 128 })
  str(e, 'coupon', path, errors, { max: 64 })
  str(e, 'list_id', path, errors, { min: 1, max: 128 })
  str(e, 'list_name', path, errors, { max: 256 })
  str(e, 'shipping_tier', path, errors, { min: 1, max: 64 })
  str(e, 'payment_type', path, errors, { min: 1, max: 64 })
  if (e.items !== undefined) {
    if (!Array.isArray(e.items)) errors.push(`${path}.items: must be an array`)
    else {
      if (e.items.length > 200) errors.push(`${path}.items: more than 200`)
      e.items.forEach((it, i) => validateItem(it, `${path}.items[${i}]`, errors))
    }
  }
  const req = ECOMMERCE_REQUIREMENTS[event]
  if (!req) return
  for (const k of req.required) if (e[k] === undefined) errors.push(`${path}.${k}: required for ${event}`)
  if (Array.isArray(e.items)) {
    if (e.items.length < req.minItems) errors.push(`${path}.items: ${event} needs at least ${req.minItems}`)
    if (req.maxItems !== undefined && e.items.length > req.maxItems) errors.push(`${path}.items: ${event} takes at most ${req.maxItems}`)
  }
}

/**
 * Validate one envelope. Returns the list of violations; empty means valid.
 * Every violation is reported, not just the first.
 */
export function validateStorefrontEvent(envelope: unknown): string[] {
  const errors: string[] = []
  if (!isObject(envelope)) return ['envelope: must be an object']
  closed(envelope, ENVELOPE_KEYS, 'envelope', errors)
  for (const k of ENVELOPE_REQUIRED) if (envelope[k] === undefined) errors.push(`envelope.${k}: required`)

  if (envelope.schema !== undefined && envelope.schema !== STOREFRONT_EVENTS_SCHEMA) errors.push(`envelope.schema: must be '${STOREFRONT_EVENTS_SCHEMA}'`)
  oneOf(envelope, 'event', STOREFRONT_EVENT_NAMES, 'envelope', errors, false)
  str(envelope, 'event_id', 'envelope', errors, { min: 1, max: 128 })
  str(envelope, 'occurred_at', 'envelope', errors, { re: DATE_TIME_RE })
  str(envelope, 'market', 'envelope', errors, { max: 64, re: MARKET_RE })
  str(envelope, 'locale', 'envelope', errors, { re: LOCALE_RE })
  str(envelope, 'currency', 'envelope', errors, { re: CURRENCY_RE })

  const page = envelope.page
  if (page !== undefined) {
    if (!isObject(page)) errors.push('page: must be an object')
    else {
      closed(page, ['path', 'type'], 'page', errors)
      str(page, 'path', 'page', errors, { required: true, max: 2048, re: PATH_RE })
      oneOf(page, 'type', PAGE_TYPES, 'page', errors, true)
    }
  }
  const customer = envelope.customer
  if (customer !== undefined) {
    if (!isObject(customer)) errors.push('customer: must be an object')
    else {
      closed(customer, ['authenticated', 'b2b'], 'customer', errors)
      for (const k of ['authenticated', 'b2b']) {
        if (customer[k] === undefined) errors.push(`customer.${k}: required`)
        else if (typeof customer[k] !== 'boolean') errors.push(`customer.${k}: must be a boolean`)
      }
    }
  }

  const event = (STOREFRONT_EVENT_NAMES as readonly string[]).includes(envelope.event as string)
    ? envelope.event as StorefrontEventName
    : null

  if (envelope.ecommerce !== undefined && event) validateEcommerce(envelope.ecommerce, event, errors)
  else if (envelope.ecommerce !== undefined && !isObject(envelope.ecommerce)) errors.push('ecommerce: must be an object')
  if (event && ECOMMERCE_REQUIREMENTS[event] && envelope.ecommerce === undefined) errors.push(`ecommerce: required for ${event}`)

  const blocks: Record<string, (b: Json) => void> = {
    search: (b) => {
      closed(b, ['search_term', 'results_count'], 'search', errors)
      str(b, 'search_term', 'search', errors, { required: true, max: 256 })
      const n = b.results_count
      if (n === undefined) errors.push('search.results_count: required')
      else if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) errors.push('search.results_count: must be an integer >= 0')
    },
    form: (b) => {
      closed(b, ['form_code', 'outcome'], 'form', errors)
      str(b, 'form_code', 'form', errors, { required: true, min: 1, max: 128 })
      oneOf(b, 'outcome', ['accepted', 'rejected'], 'form', errors, false)
    },
    auth: (b) => {
      closed(b, ['method'], 'auth', errors)
      oneOf(b, 'method', AUTH_METHODS, 'auth', errors, true)
    },
    punchout: (b) => {
      closed(b, ['protocol'], 'punchout', errors)
      oneOf(b, 'protocol', PUNCHOUT_PROTOCOLS, 'punchout', errors, true)
    },
  }
  for (const [key, check] of Object.entries(blocks)) {
    const b = envelope[key]
    if (b === undefined) continue
    if (!isObject(b)) errors.push(`${key}: must be an object`)
    else check(b)
  }
  const block = event ? BLOCK_REQUIREMENTS[event] : undefined
  if (block && envelope[block] === undefined) errors.push(`${block}: required for ${event}`)
  if (event === 'page_view' && envelope.page === undefined) errors.push('page: required for page_view')

  return errors
}

/** Throwing variant for callers that want an exception. */
export function assertStorefrontEvent(envelope: unknown): void {
  const errors = validateStorefrontEvent(envelope)
  if (errors.length) throw new TypeError(`[revenexx storefront-events] invalid envelope:\n  ${errors.join('\n  ')}`)
}
