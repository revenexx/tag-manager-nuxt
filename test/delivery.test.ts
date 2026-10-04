import { describe, expect, it } from 'vitest'
import { DEFAULT_EDITOR_HOSTS, DEFAULT_EDITOR_PATHS, isEditorOrPreviewContext } from '../src/runtime/core/context'
import { normaliseContainer, resolveDeliveryCredentials, sanitizeMarket, sanitizePreviewToken, upstreamRequest } from '../src/runtime/server/utils/delivery'

describe('the container route', () => {
  it('authenticates with the brokered context when the platform injected one', () => {
    const c = resolveDeliveryCredentials({ headers: { tenant: 'eltric', context: 'jwt.body.sig' }, config: { tenant: 'eltric', apiKey: 'rvxk_x' } })
    expect(c).toEqual({ tenant: 'eltric', jwt: 'jwt.body.sig', apiKey: '', source: 'brokered' })
    const r = upstreamRequest('https://api.revenexx.com/', c, 'de', null)
    expect(r.url).toBe('https://api.revenexx.com/v1/tag-manager/delivery/container')
    expect(r.headers).toMatchObject({ 'authorization': 'Bearer jwt.body.sig', 'x-revenexx-tenant': 'eltric', 'x-revenexx-market': 'de' })
    expect(r.headers['x-revenexx-api-key']).toBeUndefined()
  })

  it('never pairs a brokered tenant with another tenant\'s key', () => {
    const c = resolveDeliveryCredentials({ headers: { tenant: 'eltric', context: '' }, config: { tenant: 'revenexx', apiKey: 'rvxk_other' } })
    expect(c.apiKey).toBe('')
  })

  it('falls back to configured credentials, its own first and then cover\'s', () => {
    expect(resolveDeliveryCredentials({ headers: {}, config: { tenant: 't', apiKey: 'k' } }).source).toBe('config')
    expect(resolveDeliveryCredentials({ headers: {}, config: { revenexxTenant: 'cover', revenexxApiKey: 'k2' } })).toMatchObject({ tenant: 'cover', apiKey: 'k2' })
    expect(resolveDeliveryCredentials({ headers: {}, config: {} }).source).toBe('none')
  })

  it('asks for the draft by token, which is never part of a cache key', () => {
    const r = upstreamRequest('https://api.revenexx.com', { tenant: 't', jwt: '', apiKey: 'k', source: 'config' }, null, 'aaaaaaaaaaaaaaaaaaaaaaaa')
    expect(r.url).toBe('https://api.revenexx.com/v1/tag-manager/delivery/preview/aaaaaaaaaaaaaaaaaaaaaaaa')
    expect(r.headers['x-revenexx-api-key']).toBe('k')
  })

  it('accepts an apiUrl with or without a trailing /v1', () => {
    const creds = { tenant: 't', jwt: '', apiKey: 'k', source: 'config' as const }
    for (const apiUrl of ['https://api.revenexx.com', 'https://api.revenexx.com/', 'https://api.revenexx.com/v1', 'https://api.revenexx.com/v1/']) {
      expect(upstreamRequest(apiUrl, creds, null, null).url, apiUrl).toBe('https://api.revenexx.com/v1/tag-manager/delivery/container')
    }
  })

  it('ignores a malformed token or market instead of forwarding it', () => {
    expect(sanitizePreviewToken('short')).toBeNull()
    expect(sanitizePreviewToken('../../etc/passwd-xxxxxxxxxxxx')).toBeNull()
    expect(sanitizeMarket('DE')).toBe('de')
    expect(sanitizeMarket('de;drop')).toBeNull()
  })

  it('answers an empty container for anything that is not one', () => {
    expect(normaliseContainer(null).tags).toEqual([])
    expect(normaliseContainer({ error: 'x' }).tags).toEqual([])
    expect(normaliseContainer({ tags: [], settings: { event_price_basis: 'gross' } }).settings).toMatchObject({ event_price_basis: 'gross', data_layer_name: 'dataLayer' })
  })

  it('recognises editor and preview contexts', () => {
    expect(isEditorOrPreviewContext('eltric.theme.rvnxx.site', '/')).toBe(true)
    expect(isEditorOrPreviewContext('shop.eltric.de', '/admin/pages')).toBe(true)
    expect(isEditorOrPreviewContext('shop.eltric.de', '/preview/abc')).toBe(true)
    expect(isEditorOrPreviewContext('shop.eltric.de', '/administration')).toBe(false)
    expect(isEditorOrPreviewContext('shop.eltric.de', '/p/x')).toBe(false)
  })

  it('takes editor hosts and paths from the options, with the consent module\'s defaults', () => {
    expect(DEFAULT_EDITOR_HOSTS).toEqual(['*.theme.rvnxx.site'])
    expect(DEFAULT_EDITOR_PATHS).toEqual(['/admin', '/preview'])
    const options = { hosts: ['cms.example.com', '*.staging.example.com'], paths: ['/cms'] }
    expect(isEditorOrPreviewContext('cms.example.com', '/', options)).toBe(true)
    expect(isEditorOrPreviewContext('a.staging.example.com:3000', '/', options)).toBe(true)
    expect(isEditorOrPreviewContext('staging.example.com', '/', options)).toBe(false)
    expect(isEditorOrPreviewContext('shop.example.com', '/cms/pages', options)).toBe(true)
    expect(isEditorOrPreviewContext('shop.example.com', '/cmsx', options)).toBe(false)
    // Configured lists replace the defaults, they do not add to them.
    expect(isEditorOrPreviewContext('eltric.theme.rvnxx.site', '/admin', options)).toBe(false)
    expect(isEditorOrPreviewContext('eltric.theme.rvnxx.site', '/', { hosts: [], paths: [] })).toBe(false)
  })
})
