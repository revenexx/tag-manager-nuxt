import { describe, expect, it, vi } from 'vitest'
import { createTagRuntime, MAX_BUFFERED_EVENTS } from '../src/runtime/core/runtime'
import { container, ETRACKER_DEFAULT_MAP, fakeLoader, fakeProvider, flush, tag } from './fixtures/container'
import { envelope } from './fixtures/events'

const page = { path: '/', type: 'home' }

function run(tags: ReturnType<typeof tag>[], opts: { provider?: ReturnType<typeof fakeProvider>['provider'] | null, editor?: boolean, autoload?: boolean, settings?: Parameters<typeof container>[1] } = {}) {
  const loader = fakeLoader(opts.autoload ?? true)
  const w: Record<string, any> = {}
  const runtime = createTagRuntime({
    container: container(tags, opts.settings),
    provider: opts.provider ?? null,
    editorContext: opts.editor ?? false,
    load: loader.load,
    w,
    logger: { log: () => {}, warn: () => {} },
  })
  runtime.start(page)
  return { runtime, loader, w }
}

describe('the loader obeys the gating rule', () => {
  it('@spec:loader:AC-1 without a consent provider only necessary tags load', async () => {
    const { loader, runtime } = run([
      tag('basics', { purpose_code: 'necessary', vendor_code: 'shop', registry_key: null, kind: 'script', script_url: 'https://cdn.example.com/basics.js' }),
      tag('ga4'),
      tag('meta', { registry_key: 'metaPixel', vendor_code: 'meta', purpose_code: 'marketing' }),
    ])
    await flush()
    expect(loader.loaded).toEqual(['basics'])
    expect(runtime.state('ga4')).toBe('blocked')
    expect(runtime.state('meta')).toBe('blocked')
  })

  it('@spec:loader:AC-1 an editor or preview context loads no tag, even a granted one', async () => {
    const consent = fakeProvider({ purposes: { statistics: 'granted' } })
    const withProvider = run([tag('ga4'), tag('basics', { purpose_code: 'necessary' })], { provider: consent.provider, editor: true })
    const without = run([tag('basics', { purpose_code: 'necessary' })], { provider: null, editor: true })
    await flush()
    expect(withProvider.loader.registered).toEqual([])
    expect(without.loader.registered).toEqual([])
  })

  it('@spec:loader:AC-2 a consent tag loads after its purpose is granted, without a reload', async () => {
    const consent = fakeProvider()
    const { loader, runtime } = run([tag('ga4')], { provider: consent.provider })
    await flush()
    expect(runtime.state('ga4')).toBe('waiting_for_consent')
    expect(loader.loaded).toEqual([])
    consent.grant('statistics')
    await flush()
    expect(loader.loaded).toEqual(['ga4'])
    expect(runtime.state('ga4')).toBe('loaded')
  })

  it('@spec:loader:AC-3 an objectable tag loads at once', async () => {
    const consent = fakeProvider({ basis: { statistics: 'legitimate_interest' } })
    const { loader } = run([tag('et', { registry_key: 'etracker', vendor_code: 'etracker', event_map: ETRACKER_DEFAULT_MAP })], { provider: consent.provider })
    await flush()
    expect(loader.loaded).toEqual(['et'])
  })

  it('@spec:loader:AC-3 after an objection the reloaded page runs without that tag', async () => {
    const consent = fakeProvider({ basis: { statistics: 'legitimate_interest' } })
    const first = run([tag('et', { registry_key: 'etracker', vendor_code: 'etracker', event_map: ETRACKER_DEFAULT_MAP })], { provider: consent.provider })
    await flush()
    consent.object('statistics')
    // The consent module reloads the page on an objection; a fresh runtime is the reloaded page.
    first.runtime.handle(envelope('add_to_cart'))
    expect(first.w._etrackerOnReady).toBeUndefined()
    const reloaded = run([tag('et', { registry_key: 'etracker', vendor_code: 'etracker', event_map: ETRACKER_DEFAULT_MAP })], { provider: consent.provider })
    await flush()
    expect(reloaded.loader.registered).toEqual(['et'])
    expect(reloaded.loader.loaded).toEqual([])
    expect(reloaded.runtime.state('et')).toBe('waiting_for_consent')
  })

  it('@spec:loader:AC-4 events reach only allowed tags', async () => {
    const consent = fakeProvider({ purposes: { statistics: 'granted' } })
    const { runtime, w } = run([
      tag('ga4'),
      tag('meta', { registry_key: 'metaPixel', vendor_code: 'meta', purpose_code: 'marketing', event_map: { add_to_cart: { name: 'AddToCart' } } }),
    ], { provider: consent.provider })
    await flush()
    w.gtag = vi.fn()
    w.fbq = vi.fn()
    runtime.handle(envelope('add_to_cart'))
    expect(w.gtag).toHaveBeenCalledWith('event', 'add_to_cart', expect.objectContaining({ currency: 'EUR', value: 41.8 }))
    expect(w.fbq).not.toHaveBeenCalled()
  })

  it('@spec:loader:AC-4 an event is checked at the moment it happens', async () => {
    const consent = fakeProvider({ basis: { statistics: 'legitimate_interest' } })
    const { runtime, w } = run([tag('ga4')], { provider: consent.provider })
    await flush()
    w.gtag = vi.fn()
    consent.object('statistics')
    runtime.handle(envelope('add_to_cart'))
    expect(w.gtag).not.toHaveBeenCalled()
  })

  it('@spec:loader:AC-5 early events are delivered in order once the tag is ready', async () => {
    const consent = fakeProvider({ purposes: { statistics: 'granted' } })
    const { runtime, loader, w } = run([tag('ga4')], { provider: consent.provider, autoload: false })
    await flush()
    const calls: string[] = []
    w.gtag = (_c: string, _name: string, params: any) => calls.push(params.transaction_id ?? 'cart')
    runtime.handle(envelope('add_to_cart'))
    runtime.handle(envelope('purchase'))
    expect(calls).toEqual([])
    loader.release('ga4')
    await flush()
    expect(calls).toEqual(['cart', 'ORD-000123'])
  })

  it('@spec:loader:AC-5 at most fifty events are held for a tag that is not ready', async () => {
    const consent = fakeProvider({ purposes: { statistics: 'granted' } })
    const { runtime, loader, w } = run([tag('ga4')], { provider: consent.provider, autoload: false })
    await flush()
    w.gtag = vi.fn()
    for (let i = 0; i < MAX_BUFFERED_EVENTS + 10; i++) runtime.handle(envelope('add_to_cart'))
    loader.release('ga4')
    await flush()
    expect(MAX_BUFFERED_EVENTS).toBe(50)
    expect(w.gtag).toHaveBeenCalledTimes(50)
  })

  it('@spec:loader:AC-6 etracker receives the four e-commerce events by their own names', async () => {
    const consent = fakeProvider({ purposes: { statistics: 'granted' } })
    const { runtime, w } = run([tag('et', { registry_key: 'etracker', vendor_code: 'etracker', config: { id: 'AbC123' }, event_map: ETRACKER_DEFAULT_MAP })], { provider: consent.provider })
    await flush()
    const sent: unknown[][] = []
    w.etCommerce = { sendEvent: (...args: unknown[]) => sent.push(args) }
    for (const e of ['view_item', 'view_item_list', 'add_to_cart', 'purchase'] as const) runtime.handle(envelope(e))
    for (const fn of w._etrackerOnReady) fn()
    expect(sent.map(s => s[0])).toEqual(['viewProduct', 'viewProductList', 'insertToBasket', 'order'])
    expect(sent[2]![2]).toBe(10)
    expect(sent[3]![1]).toMatchObject({ orderNumber: 'ORD-000123', status: 'sale', orderPrice: '41.80', currency: 'EUR' })
  })

  it('delivers an envelope once when it arrives by hook and by DOM event', async () => {
    const consent = fakeProvider({ purposes: { statistics: 'granted' } })
    const { runtime, w } = run([tag('ga4')], { provider: consent.provider })
    await flush()
    w.gtag = vi.fn()
    const e = envelope('add_to_cart')
    runtime.handle(e)
    runtime.handle(e)
    expect(w.gtag).toHaveBeenCalledTimes(1)
  })

  it('loads a theme-event-triggered tag when its event happens, and hands it that event', async () => {
    const consent = fakeProvider({ purposes: { marketing: 'granted' } })
    const conv = tag('conv', { registry_key: 'metaPixel', vendor_code: 'meta', purpose_code: 'marketing', every_page: false, triggers: [{ code: 'buy', kind: 'theme_event', event_name: 'purchase' }], event_map: { purchase: { name: 'Purchase' } } })
    const { runtime, loader, w } = run([conv], { provider: consent.provider })
    await flush()
    expect(loader.registered).toEqual([])
    w.fbq = vi.fn()
    runtime.handle(envelope('purchase'))
    await flush()
    expect(loader.loaded).toEqual(['conv'])
    expect(w.fbq).toHaveBeenCalledWith('track', 'Purchase', expect.objectContaining({ value: 41.8 }), { eventID: 'ORD-000123' })
  })

  it('a page trigger with conditions loads only on matching pages', async () => {
    const consent = fakeProvider({ purposes: { statistics: 'granted' } })
    const t = tag('checkout-only', { every_page: false, triggers: [{ code: 'co', kind: 'page_view', conditions: { path_prefixes: ['/checkout'] } }] })
    const { runtime, loader } = run([t], { provider: consent.provider })
    await flush()
    expect(loader.registered).toEqual([])
    runtime.handle(envelope('page_view', { page: { path: '/checkout', type: 'checkout' } }))
    await flush()
    expect(loader.loaded).toEqual(['checkout-only'])
  })

  it('writes the GA4 copy to the dataLayer only while a GTM tag may run, clearing ecommerce first', async () => {
    const consent = fakeProvider({ purposes: { marketing: 'granted' } })
    const gtm = tag('gtm', { registry_key: 'googleTagManager', vendor_code: 'google-tag-manager', purpose_code: 'marketing', event_map: {} })
    const { runtime, w } = run([gtm], { provider: consent.provider })
    await flush()
    runtime.handle(envelope('add_to_cart'))
    expect(w.dataLayer[0]).toEqual({ ecommerce: null })
    expect(w.dataLayer[1]).toMatchObject({ event: 'add_to_cart', ecommerce: { currency: 'EUR', value: 41.8 } })
    const none = run([gtm], { provider: fakeProvider().provider })
    await flush()
    none.runtime.handle(envelope('add_to_cart'))
    expect(none.w.dataLayer).toBeUndefined()
  })

  it('never writes Consent Mode defaults', async () => {
    const consent = fakeProvider({ purposes: { statistics: 'granted', marketing: 'granted' } })
    const { runtime, w } = run([tag('ga4'), tag('gtm', { registry_key: 'googleTagManager', purpose_code: 'marketing', event_map: {} })], { provider: consent.provider })
    await flush()
    w.gtag = vi.fn()
    runtime.handle(envelope('add_to_cart'))
    const consentCalls = (w.gtag as any).mock.calls.filter((c: unknown[]) => c[0] === 'consent')
    expect(consentCalls).toEqual([])
    expect(JSON.stringify(w.dataLayer)).not.toContain('consent')
  })

  it('applies the price basis to vendor values', async () => {
    const consent = fakeProvider({ purposes: { statistics: 'granted' } })
    const { runtime, w } = run([tag('ga4')], { provider: consent.provider, settings: { event_price_basis: 'gross' } })
    await flush()
    w.gtag = vi.fn()
    runtime.handle(envelope('add_to_cart'))
    expect(w.gtag).toHaveBeenCalledWith('event', 'add_to_cart', expect.objectContaining({ value: 49.7, items: [expect.objectContaining({ price: 4.97 })] }))
  })

  it('substitutes variables into event-map params', async () => {
    const consent = fakeProvider({ purposes: { statistics: 'granted' } })
    const t = tag('ga4', { event_map: { add_to_cart: { name: 'add_to_cart', params: { shop: '{{shop}}', first_sku: '{{first_sku}}' } } } })
    const loader = fakeLoader()
    const c = container([t])
    c.variables = [{ code: 'shop', kind: 'constant', value: 'eltric' }, { code: 'first_sku', kind: 'event_field', path: 'ecommerce.items.0.sku' }]
    const w: Record<string, any> = { gtag: vi.fn() }
    const runtime = createTagRuntime({ container: c, provider: consent.provider, editorContext: false, load: loader.load, w })
    runtime.start(page)
    await flush()
    runtime.handle(envelope('add_to_cart'))
    expect(w.gtag).toHaveBeenCalledWith('event', 'add_to_cart', expect.objectContaining({ shop: 'eltric', first_sku: 'LS-B16-1P' }))
  })
})
