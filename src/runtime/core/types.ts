/**
 * The published container as `tag-manager.delivery.container` answers it, and
 * the consent seam this module depends on. Framework-free on purpose: the
 * runtime in this directory is what the tests drive, the Nuxt plugin only
 * wires it to @nuxt/scripts.
 */
import type { Ref } from 'vue'

export type LoadTiming = 'immediate' | 'idle' | 'interaction'
export type PriceBasis = 'net' | 'gross'

/** One mapped call: the vendor's own event name plus optional static params with `{{variable}}`s. */
export interface EventMapEntry {
  name: string
  params?: Record<string, unknown>
}

/** A trigger's conditions. Every set key must match; an absent key matches anything. */
export interface TriggerConditions {
  path_prefixes?: string[]
  page_types?: string[]
  b2b?: boolean
}

export interface ContainerTrigger {
  code: string
  kind: 'page_view' | 'storefront_event'
  event_name?: string | null
  conditions?: TriggerConditions
}

export interface ContainerTag {
  code: string
  name: string
  kind: 'registry' | 'script'
  registry_key: string | null
  script_url: string | null
  config: Record<string, unknown>
  vendor_code: string
  purpose_code: string
  chained_vendor_codes: string[]
  load: LoadTiming
  /** Storefront event name → vendor call. Already merged with the registry default at publish. */
  event_map: Record<string, EventMapEntry | null>
  /** True when the tag has no trigger: it loads on every page. */
  every_page: boolean
  triggers: ContainerTrigger[]
  hosts: string[]
}

export interface ContainerVariable {
  code: string
  kind: 'event_field' | 'constant' | 'page'
  path?: string | null
  value?: unknown
}

export interface TagManagerSettings {
  event_price_basis: PriceBasis
  data_layer_name: string
  push_events_to_data_layer: boolean
  first_party_mode: boolean
}

export interface DeliveredContainer {
  container: {
    version: number | null
    sha256: string | null
    policy_version_number: number | null
    published_at: string | null
    market: string | null
    preview: boolean
  }
  settings: TagManagerSettings
  tags: ContainerTag[]
  variables: ContainerVariable[]
  hosts: string[]
}

export type ConsentDecision = 'granted' | 'denied' | 'objected'

export interface ConsentState {
  purposes: Record<string, ConsentDecision>
  vendors: Record<string, ConsentDecision>
}

/**
 * The ONLY coupling to the consent module (SHARED-CONTRACT). It is provided as
 * `nuxtApp.$consentProvider` by @revenexx/consent-manager-nuxt; this module
 * never imports that package.
 */
export interface ConsentProvider {
  readonly ready: Promise<void>
  allows(vendor: string, purpose: string): boolean
  trigger(vendor: string, purpose: string): Promise<void> & { consented: Ref<boolean> }
  googleSignals(): Record<'ad_storage' | 'analytics_storage' | 'ad_user_data' | 'ad_personalization' | 'functionality_storage' | 'personalization_storage' | 'security_storage', 'granted' | 'denied'>
  onChange(cb: (state: ConsentState) => void): () => void
}

export const DEFAULT_SETTINGS: TagManagerSettings = {
  event_price_basis: 'net',
  data_layer_name: 'dataLayer',
  push_events_to_data_layer: true,
  first_party_mode: true,
}

export const EMPTY_CONTAINER: DeliveredContainer = {
  container: { version: null, sha256: null, policy_version_number: null, published_at: null, market: null, preview: false },
  settings: DEFAULT_SETTINGS,
  tags: [],
  variables: [],
  hosts: [],
}
