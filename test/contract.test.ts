import { describe, expect, it } from 'vitest'
import { createThemeEvents, validateThemeEvent } from '../src/runtime/events'
import { BLOCK_REQUIREMENTS, ECOMMERCE_REQUIREMENTS, FORBIDDEN_FIELDS, PAGE_TYPES, THEME_EVENT_NAMES, THEME_EVENTS_SCHEMA_ID } from '../src/runtime/events/vocabulary'
import { ajvValidate, schema } from './fixtures/ajv'
import { CONTEXT, DATA, envelope, ITEM } from './fixtures/events'

const both = (e: unknown) => ({ ajv: ajvValidate(e), ours: validateThemeEvent(e) })

function emitter(storage = new Map<string, string>()) {
  const hooked: unknown[] = []
  const events = createThemeEvents({
    context: () => structuredClone(CONTEXT),
    callHook: (_name, e) => hooked.push(e),
    target: null,
    validate: true,
    onInvalid: 'throw',
    storage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) },
  })
  return { events, hooked, storage }
}

describe('the schema and its TypeScript twin', () => {
  it('names the published id and version', () => {
    expect(schema.$id).toBe(THEME_EVENTS_SCHEMA_ID)
    expect(schema.properties.schema.const).toBe('theme-events/1')
  })

  it('lists the same vocabulary, page types and forbidden fields', () => {
    expect(schema.properties.event.enum).toEqual([...THEME_EVENT_NAMES])
    expect(schema.$defs.page.properties.type.enum).toEqual([...PAGE_TYPES])
    expect(schema['x-revenexx-forbidden-fields']).toEqual([...FORBIDDEN_FIELDS])
  })

  it('requires the same ecommerce fields per event as the validator', () => {
    for (const rule of schema.allOf as Array<{ if: { properties: { event: { const: string } } }, then: any }>) {
      const event = rule.if.properties.event.const as keyof typeof ECOMMERCE_REQUIREMENTS
      const req = ECOMMERCE_REQUIREMENTS[event]
      const ecom = rule.then.properties?.ecommerce
      if (req) {
        expect(ecom.required, event).toEqual([...req.required])
        expect(ecom.properties.items.minItems, event).toBe(req.minItems)
        expect(ecom.properties.items.maxItems, event).toBe(req.maxItems)
      }
      else {
        expect(ecom, event).toBeUndefined()
      }
      const block = BLOCK_REQUIREMENTS[event]
      if (block) expect(rule.then.required, event).toContain(block)
    }
  })

  it('agrees with a 2020-12 validator on every valid fixture', () => {
    for (const name of THEME_EVENT_NAMES) {
      const r = both(envelope(name))
      expect(r.ajv, `${name}: ${JSON.stringify(ajvValidate.errors)}`).toBe(true)
      expect(r.ours, name).toEqual([])
    }
  })

  it.each([
    ['an unknown event', envelope('view_item', { event: 'checkout_progress' as never })],
    ['a missing market', (() => { const e: any = envelope('view_item'); delete e.market; return e })()],
    ['a query string in the path', envelope('page_view', { page: { path: '/search?q=x', type: 'search' } })],
    ['view_item with two items', envelope('view_item', { ecommerce: { items: [ITEM, ITEM] } })],
    ['purchase without tax', envelope('purchase', { ecommerce: { transaction_id: 'X', value_net: 1, value_gross: 1, shipping: 0, items: [ITEM] } })],
    ['purchase with an unknown value', envelope('purchase', { ecommerce: { transaction_id: 'X', value_net: null, value_gross: 1, tax: 0, shipping: 0, items: [ITEM] } })],
    ['search without a result count', envelope('search', { search: { search_term: 'x' } as never })],
    ['a lowercase currency', envelope('view_item', { currency: 'eur' })],
    ['a zero quantity', envelope('add_to_cart', { ecommerce: { items: [{ ...ITEM, quantity: 0 }] } })],
    ['six category levels', envelope('view_item', { ecommerce: { items: [{ ...ITEM, category_path: ['a', 'b', 'c', 'd', 'e', 'f'] }] } })],
    ['login without a method', envelope('login', { auth: undefined })],
  ])('both refuse %s', (_label, e) => {
    const r = both(e)
    expect(r.ajv).toBe(false)
    expect(r.ours.length).toBeGreaterThan(0)
  })
})

describe('theme events are one versioned contract', () => {
  it('@spec:theme-events:AC-1 every emitted event validates against the schema version it names', () => {
    const { events, hooked } = emitter()
    for (const name of THEME_EVENT_NAMES) {
      const out = events.emit(name, structuredClone(DATA[name]))
      expect(out, name).not.toBeNull()
      expect(out!.schema).toBe('theme-events/1')
      expect(ajvValidate(out), `${name}: ${JSON.stringify(ajvValidate.errors)}`).toBe(true)
    }
    expect(hooked).toHaveLength(THEME_EVENT_NAMES.length)
  })

  it('@spec:theme-events:AC-1 an invalid event is not emitted in validate mode', () => {
    const { events, hooked } = emitter()
    expect(() => events.emit('view_item', { ecommerce: { items: [] } })).toThrow(/at least 1/)
    expect(hooked).toHaveLength(0)
  })

  it('@spec:theme-events:AC-3 purchase fires once per order across reloads', () => {
    const storage = new Map<string, string>()
    const first = emitter(storage)
    const once = first.events.emit('purchase', structuredClone(DATA.purchase))
    expect(once?.event_id).toBe('ORD-000123')
    // The confirmation page reloaded twice: a new emitter, the same session storage.
    for (let i = 0; i < 2; i++) {
      const again = emitter(storage)
      expect(again.events.emit('purchase', structuredClone(DATA.purchase))).toBeNull()
      expect(again.hooked).toHaveLength(0)
    }
    expect(first.hooked).toHaveLength(1)
  })

  it('@spec:theme-events:AC-3 a different order is its own purchase', () => {
    const { events, hooked } = emitter()
    events.emit('purchase', structuredClone(DATA.purchase))
    events.emit('purchase', { ecommerce: { ...structuredClone(DATA.purchase.ecommerce!), transaction_id: 'ORD-000124' } })
    expect(hooked).toHaveLength(2)
  })

  it('@spec:theme-events:AC-4 no event carries personal data', () => {
    for (const field of ['email', 'name', 'phone', 'customer_number', 'company_name']) {
      const e: any = envelope('view_item')
      e.customer = { ...e.customer, [field]: 'x' }
      expect(both(e).ajv, field).toBe(false)
      expect(validateThemeEvent(e).join(), field).toMatch(new RegExp(`customer.${field}`))
    }
    const top: any = envelope('login')
    top.email = 'a@b.de'
    expect(both(top).ajv).toBe(false)
    expect(validateThemeEvent(top).join()).toMatch(/personal data is forbidden/)
    const onItem: any = envelope('add_to_cart')
    onItem.ecommerce.items[0].customer_number = '10042'
    expect(both(onItem).ajv).toBe(false)
  })

  it('@spec:theme-events:AC-4 a typed email or phone never leaves the emitter', () => {
    const { events } = emitter()
    const a = events.emit('search', { search: { search_term: 'max.mustermann@example.de', results_count: 0 } })
    const b = events.emit('search', { search: { search_term: '+49 921 897 214', results_count: 0 } })
    const c = events.emit('page_view', { page: { path: '/search?q=max@example.de', type: 'search' } })
    expect(a?.search?.search_term).toBe('[redacted]')
    expect(b?.search?.search_term).toBe('[redacted]')
    expect(c?.page.path).toBe('/search')
  })

  it('@spec:theme-events:AC-4 the visitor is described by two booleans only', () => {
    const events = createThemeEvents({
      context: () => ({ ...structuredClone(CONTEXT), customer: { authenticated: true, b2b: true, email: 'x@y.de' } as never }),
      target: null,
      storage: null,
    })
    const out = events.emit('login', { auth: { method: 'password' } })
    expect(Object.keys(out!.customer).sort()).toEqual(['authenticated', 'b2b'])
  })

  it('@spec:theme-events:AC-5 items carry net and gross where the price is known', () => {
    const { events } = emitter()
    const out = events.emit('view_item', { ecommerce: { items: [ITEM] } })
    expect(out?.ecommerce?.items?.[0]).toMatchObject({ price_net: 4.18, price_gross: 4.97 })
    const unknown = envelope('view_item', { ecommerce: { items: [{ ...ITEM, price_net: null, price_gross: null }] } })
    expect(both(unknown).ajv).toBe(true)
    expect(both(unknown).ours).toEqual([])
  })

  it('dispatches the DOM event with the envelope as detail', () => {
    const seen: Event[] = []
    const events = createThemeEvents({ context: () => structuredClone(CONTEXT), target: { dispatchEvent: (e) => { seen.push(e); return true } }, storage: null })
    const out = events.emit('view_item', { ecommerce: { items: [ITEM] } })
    expect(seen).toHaveLength(1)
    expect(seen[0]!.type).toBe('revenexx:event')
    expect((seen[0] as CustomEvent).detail).toBe(out)
  })
})
