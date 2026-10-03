/**
 * GET /_tag-manager/container — the published container for this tenant and
 * market, cached by Nitro for `cacheMaxAge` seconds; with a preview token the
 * unpublished draft, never cached. Answers an empty container rather than an
 * error when the gateway cannot be reached: a storefront without tags is
 * correct, a storefront that fails to render is not.
 */
import { defineCachedEventHandler, useRuntimeConfig } from 'nitropack/runtime'
import { getCookie, getQuery, getRequestHeader } from 'h3'
import type { H3Event } from 'h3'
import { EMPTY_CONTAINER } from '../../core/types'
import { normaliseContainer, resolveDeliveryCredentials, sanitizeMarket, sanitizePreviewToken, upstreamRequest } from '../utils/delivery'

function inputs(event: H3Event) {
  const config = useRuntimeConfig(event)
  const query = getQuery(event)
  const creds = resolveDeliveryCredentials({
    headers: { tenant: getRequestHeader(event, 'x-revenexx-tenant'), context: getRequestHeader(event, 'x-revenexx-context') },
    config: {
      tenant: config.tagManager?.tenant,
      apiKey: config.tagManager?.apiKey,
      revenexxTenant: (config as Record<string, unknown>).revenexxTenant as string | undefined,
      revenexxApiKey: (config as Record<string, unknown>).revenexxApiKey as string | undefined,
    },
  })
  const market = sanitizeMarket(query.market)
    ?? sanitizeMarket(getRequestHeader(event, 'x-revenexx-market'))
    ?? sanitizeMarket(getCookie(event, config.public.tagManager?.marketCookie || 'cover-market'))
  const preview = sanitizePreviewToken(query.preview)
  return { config, creds, market, preview }
}

export default defineCachedEventHandler(async (event: H3Event) => {
  const { config, creds, market, preview } = inputs(event)
  if (!creds.tenant || (!creds.jwt && !creds.apiKey)) return EMPTY_CONTAINER
  const req = upstreamRequest(config.tagManager?.apiUrl, creds, market, preview)
  try {
    const body = await $fetch(req.url, { headers: req.headers, timeout: 3000 })
    return normaliseContainer(body)
  }
  catch (err) {
    console.warn('[revenexx tag-manager] container could not be loaded:', (err as Error)?.message ?? err)
    return EMPTY_CONTAINER
  }
}, {
  name: 'revenexx-tag-manager-container',
  maxAge: 60,
  swr: true,
  // The key is the tenant and the market — never a credential, never a client-chosen value beyond the market code.
  getKey: (event: H3Event) => {
    const { creds, market } = inputs(event)
    return `${creds.tenant || 'none'}:${market || 'global'}`
  },
  // A draft is never cached: it changes with every edit and is visible to one person.
  shouldBypassCache: (event: H3Event) => sanitizePreviewToken(getQuery(event).preview) !== null,
})
