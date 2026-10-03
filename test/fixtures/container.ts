import { ref } from 'vue'
import type { ConsentProvider, ContainerTag, DeliveredContainer } from '../../src/runtime/core/types'
import { DEFAULT_SETTINGS } from '../../src/runtime/core/types'

/** The etracker default event map, exactly as the app's registry serves it. */
export const ETRACKER_DEFAULT_MAP = {
  view_item: { name: 'viewProduct' },
  view_item_list: { name: 'viewProductList' },
  search: { name: 'viewProductList' },
  add_to_cart: { name: 'insertToBasket' },
  remove_from_cart: { name: 'removeFromBasket' },
  add_to_orderlist: { name: 'insertToWatchlist' },
  purchase: { name: 'order' },
  request_quote: { name: 'order' },
  punchout_transfer: { name: 'order' },
}

export function tag(code: string, over: Partial<ContainerTag> = {}): ContainerTag {
  return {
    code,
    name: code,
    kind: 'registry',
    registry_key: 'googleAnalytics',
    script_url: null,
    config: { id: 'G-TEST1234' },
    vendor_code: 'google-analytics',
    purpose_code: 'statistics',
    chained_vendor_codes: [],
    load: 'immediate',
    event_map: { add_to_cart: { name: 'add_to_cart' }, purchase: { name: 'purchase' } },
    every_page: true,
    triggers: [],
    hosts: ['www.googletagmanager.com'],
    ...over,
  }
}

export function container(tags: ContainerTag[], settings: Partial<typeof DEFAULT_SETTINGS> = {}): DeliveredContainer {
  return {
    container: { version: 3, sha256: 'ab'.repeat(32), policy_version_number: 7, published_at: '2026-10-03T09:00:00Z', market: 'de', preview: false },
    settings: { ...DEFAULT_SETTINGS, ...settings },
    tags,
    variables: [],
    hosts: [...new Set(tags.flatMap(t => t.hosts))],
  }
}

/**
 * A ConsentProvider double with the SHARED-CONTRACT shape: purposes and vendors
 * decided by the test, `trigger()` resolving the moment a grant arrives.
 */
export function fakeProvider(initial: { purposes?: Record<string, 'granted' | 'denied' | 'objected'>, basis?: Record<string, 'consent' | 'legitimate_interest' | 'necessary'> } = {}) {
  const purposes: Record<string, 'granted' | 'denied' | 'objected'> = { ...initial.purposes }
  const basis: Record<string, 'consent' | 'legitimate_interest' | 'necessary'> = { necessary: 'necessary', statistics: 'consent', marketing: 'consent', ...initial.basis }
  const waiters: Array<{ vendor: string, purpose: string, resolve: () => void, consented: ReturnType<typeof ref<boolean>> }> = []
  const allows = (_vendor: string, purpose: string): boolean => {
    const b = basis[purpose]
    if (b === 'necessary') return true
    if (b === 'legitimate_interest') return purposes[purpose] !== 'objected'
    if (b === 'consent') return purposes[purpose] === 'granted'
    return false
  }
  const provider: ConsentProvider = {
    ready: Promise.resolve(),
    allows,
    trigger(vendor, purpose) {
      const consented = ref(allows(vendor, purpose))
      const p = new Promise<void>((resolve) => {
        if (consented.value) return resolve()
        waiters.push({ vendor, purpose, resolve, consented })
      }) as Promise<void> & { consented: typeof consented }
      p.consented = consented
      return p as never
    },
    googleSignals: () => ({ ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', functionality_storage: 'denied', personalization_storage: 'denied', security_storage: 'granted' }),
    onChange: () => () => {},
  }
  return {
    provider,
    grant(purpose: string) {
      purposes[purpose] = 'granted'
      for (const w of waiters.filter(x => x.purpose === purpose && allows(x.vendor, x.purpose))) {
        w.consented.value = true
        w.resolve()
      }
    },
    object(purpose: string) {
      purposes[purpose] = 'objected'
    },
  }
}

/** A loader double: records what was registered and lets the test decide when a script is "loaded". */
export function fakeLoader(autoload = true) {
  const registered: string[] = []
  const loaded: string[] = []
  const release = new Map<string, () => void>()
  const load = (t: ContainerTag, trigger: Promise<void>) => {
    registered.push(t.code)
    return trigger.then(() => new Promise<void>((resolve) => {
      const done = () => {
        loaded.push(t.code)
        resolve()
      }
      if (autoload) done()
      else release.set(t.code, done)
    }))
  }
  return { load, registered, loaded, release: (code: string) => release.get(code)?.() }
}

export const flush = () => new Promise(r => setTimeout(r, 0))
