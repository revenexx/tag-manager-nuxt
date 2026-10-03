import { describe, expect, it, vi } from 'vitest'
import { ADAPTERS, etrackerProduct, ga4Item } from '../src/runtime/core/adapters'
import { envelope, ITEM } from './fixtures/events'

const ctx = (w: Record<string, any> = {}, params: Record<string, unknown> = {}) => ({ w, basis: 'net' as const, dataLayerName: 'dataLayer', params, state: {} })

describe('vendor adapters', () => {
  it('maps an item to GA4 with up to five category levels', () => {
    expect(ga4Item({ ...ITEM, category_path: ['a', 'b', 'c', 'd', 'e', 'f'] }, 'net')).toEqual({
      item_id: 'LS-B16-1P', item_name: ITEM.name, quantity: 10, item_brand: 'Hager', price: 4.18, index: 3,
      item_category: 'a', item_category2: 'b', item_category3: 'c', item_category4: 'd', item_category5: 'e',
    })
  })

  it('maps an item to etracker with four category levels and a string price', () => {
    expect(etrackerProduct({ ...ITEM, category_path: ['a', 'b', 'c', 'd', 'e'] }, 'EUR', 'gross')).toEqual({
      id: 'LS-B16-1P', name: ITEM.name, price: '4.97', currency: 'EUR', category: ['a', 'b', 'c', 'd'],
    })
  })

  it('sends a quote request and a punchout handover to etracker as leads', () => {
    const sent: any[] = []
    const w: Record<string, any> = { etCommerce: { sendEvent: (...a: unknown[]) => sent.push(a) } }
    ADAPTERS.etracker!({ name: 'order' }, envelope('request_quote'), ctx(w))
    ADAPTERS.etracker!({ name: 'order' }, envelope('punchout_transfer'), ctx(w))
    for (const fn of w._etrackerOnReady) fn()
    expect(sent.map(s => s[1].status)).toEqual(['lead', 'lead'])
  })

  it('tells etracker which kind of list it saw', () => {
    const sent: any[] = []
    const w: Record<string, any> = { etCommerce: { sendEvent: (...a: unknown[]) => sent.push(a) } }
    ADAPTERS.etracker!({ name: 'viewProductList' }, envelope('view_item_list'), ctx(w))
    ADAPTERS.etracker!({ name: 'viewProductList' }, { ...envelope('search'), ecommerce: { items: [ITEM] } }, ctx(w))
    for (const fn of w._etrackerOnReady) fn()
    expect(sent.map(s => s[1].listType)).toEqual(['categorylist', 'searchlist'])
  })

  it('uses Meta standard events with track and anything else with trackCustom', () => {
    const fbq = vi.fn()
    ADAPTERS.metaPixel!({ name: 'AddToCart' }, envelope('add_to_cart'), ctx({ fbq }))
    ADAPTERS.metaPixel!({ name: 'RequestQuote' }, envelope('request_quote'), ctx({ fbq }))
    expect(fbq.mock.calls[0]![0]).toBe('track')
    expect(fbq.mock.calls[0]![2]).toMatchObject({ content_ids: ['LS-B16-1P'], content_type: 'product', currency: 'EUR' })
    expect(fbq.mock.calls[1]![0]).toBe('trackCustom')
  })

  it('pushes HubSpot SPA page views after the first, and custom events without personal data', () => {
    const w: Record<string, any> = {}
    const state = {}
    const c = { ...ctx(w), state }
    ADAPTERS.hubspot!({ name: 'trackPageView' }, envelope('page_view'), c)
    expect(w._hsq ?? []).toEqual([])
    ADAPTERS.hubspot!({ name: 'trackPageView' }, envelope('page_view', { page: { path: '/cart', type: 'cart' } }), c)
    expect(w._hsq).toEqual([['setPath', '/cart'], ['trackPageView']])
    ADAPTERS.hubspot!({ name: 'pe_quote' }, envelope('request_quote'), c)
    expect(w._hsq[2][0]).toBe('trackCustomBehavioralEvent')
    expect(JSON.stringify(w._hsq[2])).not.toMatch(/email|identify/)
  })

  it('records a Matomo order with its items', () => {
    const w: Record<string, any> = {}
    ADAPTERS.matomoAnalytics!({ name: 'trackEcommerceOrder' }, envelope('purchase'), ctx(w))
    expect(w._paq[0][0]).toBe('addEcommerceItem')
    expect(w._paq[1]).toEqual(['trackEcommerceOrder', 'ORD-000123', 41.8, 41.8, 7.94, 0, false])
  })

  it('tracks a LinkedIn conversion by its id', () => {
    const lintrk = vi.fn()
    ADAPTERS.linkedinInsight!({ name: '1234567' }, envelope('purchase'), ctx({ lintrk }))
    expect(lintrk).toHaveBeenCalledWith('track', { conversion_id: 1234567 })
  })

  it('has an adapter for every registry key the app supports', () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual(['bingUet', 'clarity', 'crisp', 'etracker', 'googleAnalytics', 'googleTagManager', 'hotjar', 'hubspot', 'intercom', 'linkedinInsight', 'matomoAnalytics', 'metaPixel', 'tawkTo', 'tiktokPixel'])
  })
})
