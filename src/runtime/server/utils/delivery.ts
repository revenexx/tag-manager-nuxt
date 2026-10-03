/**
 * Building and reading the call to `tag-manager.delivery.container`.
 *
 * Pure: no Nitro, no h3, so the credential rules are unit-tested. The route in
 * ../routes wires it to the request.
 *
 * Who the call authenticates as (ADR-0062), in descending precedence:
 *   1. the brokered platform context — on a deployed Site the platform strips
 *      any inbound `x-revenexx-tenant`/`x-revenexx-context`, resolves the
 *      tenant from the host and injects both. The JWT goes out as Bearer.
 *   2. runtime config `tagManager.tenant` + `tagManager.apiKey` — local dev.
 *   3. cover's own runtime config names (`revenexxTenant` + `revenexxApiKey`),
 *      so a cover theme needs no second copy of its key.
 * A tenant header without a token takes a key only from config naming the
 * SAME tenant — never another tenant's key.
 */
import type { DeliveredContainer } from '../../core/types'
import { DEFAULT_SETTINGS, EMPTY_CONTAINER } from '../../core/types'

export interface DeliveryCredentials {
  tenant: string
  jwt: string
  apiKey: string
  source: 'brokered' | 'config' | 'none'
}

export interface CredentialInputs {
  headers: { tenant?: string | null, context?: string | null }
  config: { tenant?: string, apiKey?: string, revenexxTenant?: string, revenexxApiKey?: string }
}

export function resolveDeliveryCredentials({ headers, config }: CredentialInputs): DeliveryCredentials {
  const pairs = [
    { tenant: String(config.tenant || '').trim(), apiKey: String(config.apiKey || '').trim() },
    { tenant: String(config.revenexxTenant || '').trim(), apiKey: String(config.revenexxApiKey || '').trim() },
  ].filter(p => p.tenant && p.apiKey)

  const brokeredTenant = String(headers.tenant || '').trim()
  if (brokeredTenant) {
    const jwt = String(headers.context || '').trim()
    const apiKey = jwt ? '' : (pairs.find(p => p.tenant === brokeredTenant)?.apiKey ?? '')
    return { tenant: brokeredTenant, jwt, apiKey, source: 'brokered' }
  }
  const pair = pairs[0]
  if (pair) return { tenant: pair.tenant, jwt: '', apiKey: pair.apiKey, source: 'config' }
  return { tenant: '', jwt: '', apiKey: '', source: 'none' }
}

const TOKEN_RE = /^[\w-]{16,128}$/
const MARKET_RE = /^[a-z0-9][\w-]{0,63}$/

/** A preview token is opaque; anything that does not look like one is ignored, not forwarded. */
export function sanitizePreviewToken(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  return typeof v === 'string' && TOKEN_RE.test(v) ? v : null
}

export function sanitizeMarket(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  return typeof v === 'string' && MARKET_RE.test(v.toLowerCase()) ? v.toLowerCase() : null
}

export interface UpstreamRequest {
  url: string
  headers: Record<string, string>
}

/** The gateway request for the published container, or the draft when a preview token is given. */
export function upstreamRequest(apiUrl: string, creds: DeliveryCredentials, market: string | null, previewToken: string | null): UpstreamRequest {
  const base = String(apiUrl || 'https://api.revenexx.com').replace(/\/+$/, '')
  const path = previewToken
    ? `/v1/tag-manager/delivery/preview/${encodeURIComponent(previewToken)}`
    : '/v1/tag-manager/delivery/container'
  const headers: Record<string, string> = { 'accept': 'application/json', 'x-revenexx-tenant': creds.tenant }
  if (creds.jwt) headers.authorization = `Bearer ${creds.jwt}`
  else if (creds.apiKey) headers['x-revenexx-api-key'] = creds.apiKey
  if (market) headers['x-revenexx-market'] = market
  return { url: base + path, headers }
}

/** Accept the gateway answer only in the shape the runtime understands; anything else is an empty container. */
export function normaliseContainer(body: unknown): DeliveredContainer {
  if (!body || typeof body !== 'object') return EMPTY_CONTAINER
  const b = body as Partial<DeliveredContainer>
  if (!Array.isArray(b.tags)) return EMPTY_CONTAINER
  return {
    container: { ...EMPTY_CONTAINER.container, ...(b.container ?? {}) },
    settings: { ...DEFAULT_SETTINGS, ...(b.settings ?? {}) },
    tags: b.tags,
    variables: Array.isArray(b.variables) ? b.variables : [],
    hosts: Array.isArray(b.hosts) ? b.hosts : [],
  }
}
