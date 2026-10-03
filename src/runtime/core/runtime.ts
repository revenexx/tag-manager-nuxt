/**
 * The tag runtime: which tag loads when, and which theme event reaches
 * which tag. Framework-free so every acceptance criterion of the loader can be
 * driven without a browser; the Nuxt plugin hands it a `load` function backed
 * by @nuxt/scripts and the visitor's consent provider.
 *
 * The rule it applies (SHARED-CONTRACT, normative):
 *   - in an editor or preview context nothing loads;
 *   - otherwise a tag may load when `provider.allows(vendor, purpose)`; without
 *     a provider only tags under the `necessary` purpose load;
 *   - a tag not allowed yet is registered with `provider.trigger(...)` and
 *     loads the moment consent arrives — no reload;
 *   - an event reaches a tag only if the tag is allowed AT THAT MOMENT; while
 *     an allowed tag is still loading, at most 50 events are buffered for it
 *     and delivered in order once it is ready;
 *   - a transition allowed → not allowed is the consent module's page reload,
 *     not ours: a loaded script cannot be unloaded.
 */
import type { ThemeEventEnvelope } from '../events/types'
import { ADAPTERS, pushToDataLayer } from './adapters'
import { eventTriggerMatches, NECESSARY_PURPOSE, substitute, tagWantedOnPage } from './context'
import type { ConsentProvider, ContainerTag, DeliveredContainer, EventMapEntry, LoadTiming } from './types'

export const LOG_PREFIX = '[revenexx tag-manager]'
export const MAX_BUFFERED_EVENTS = 50
const SEEN_EVENT_IDS = 500

export type TagLoadState = 'idle' | 'waiting_for_consent' | 'loading' | 'loaded' | 'blocked'

/**
 * Register one tag's script and resolve once it has loaded. `trigger` resolves
 * when the script may start loading; until then nothing is requested.
 */
export type TagLoader = (tag: ContainerTag, trigger: Promise<void>) => Promise<void>

export interface TagRuntimeOptions {
  container: DeliveredContainer
  provider: ConsentProvider | null
  editorContext: boolean
  load: TagLoader
  /** Resolves when a tag with this load timing may start (idle, first interaction, …). */
  timing?: (load: LoadTiming) => Promise<void>
  /** The page's window (a plain object in tests). */
  w: Record<string, any>
  /** Log every decision and event with the `[revenexx tag-manager]` prefix (preview mode). */
  debug?: boolean
  logger?: Pick<Console, 'log' | 'warn'>
}

interface TagSlot {
  tag: ContainerTag
  state: TagLoadState
  buffer: ThemeEventEnvelope[]
  adapterState: Record<string, unknown>
}

export interface TagRuntime {
  /** Activate the tags wanted on the current page. Call once with the first page. */
  start(page: { path: string, type?: string }, b2b?: boolean | null): void
  /** Hand one theme event to the runtime. */
  handle(envelope: ThemeEventEnvelope): void
  /** Whether this tag may run right now under the gating rule. */
  allowed(tag: ContainerTag): boolean
  state(code: string): TagLoadState | undefined
  readonly hosts: string[]
  readonly container: DeliveredContainer
}

function normaliseEntry(entry: EventMapEntry | string | null | undefined): EventMapEntry | null {
  if (!entry) return null
  if (typeof entry === 'string') return { name: entry }
  return entry.name ? entry : null
}

export function createTagRuntime(options: TagRuntimeOptions): TagRuntime {
  const { container, provider, editorContext, load, w } = options
  const timing = options.timing ?? (() => Promise.resolve())
  const logger = options.logger ?? console
  const debug = (...args: unknown[]) => {
    if (options.debug) logger.log(LOG_PREFIX, ...args)
  }
  const settings = container.settings
  const slots = new Map<string, TagSlot>(container.tags.map(tag => [tag.code, { tag, state: 'idle', buffer: [], adapterState: {} }]))
  const seen: string[] = []

  function allowed(tag: ContainerTag): boolean {
    // The gating rule's first conjunct holds for every tag, provider or not:
    // an editor or preview host runs no tag at all (ADR-0110).
    if (editorContext) return false
    if (provider) {
      try {
        return provider.allows(tag.vendor_code, tag.purpose_code) === true
      }
      catch {
        // Any uncertainty is a no.
        return false
      }
    }
    // No consent provider: necessary tags only.
    return tag.purpose_code === NECESSARY_PURPOSE
  }

  function deliver(slot: TagSlot, envelope: ThemeEventEnvelope): void {
    const entry = normaliseEntry(slot.tag.event_map?.[envelope.event] as EventMapEntry | string | null | undefined)
    const adapter = slot.tag.registry_key ? ADAPTERS[slot.tag.registry_key] : undefined
    if (!entry || !adapter) return
    const scope = { envelope, page: envelope.page }
    const params = substitute(entry.params ?? {}, container.variables, scope)
    try {
      adapter(entry, envelope, { w, basis: settings.event_price_basis, dataLayerName: settings.data_layer_name, params, state: slot.adapterState })
      debug(`event '${envelope.event}' → ${slot.tag.code} as '${entry.name}'`)
    }
    catch (err) {
      logger.warn(LOG_PREFIX, `tag '${slot.tag.code}' failed on '${envelope.event}'`, err)
    }
  }

  function activate(slot: TagSlot): void {
    if (slot.state !== 'idle') return
    const { tag } = slot
    let trigger: Promise<void>
    if (allowed(tag)) {
      slot.state = 'loading'
      trigger = timing(tag.load)
      debug(`load '${tag.code}' (${tag.vendor_code}/${tag.purpose_code}, ${tag.load})`)
    }
    else if (provider && !editorContext) {
      slot.state = 'waiting_for_consent'
      debug(`wait for consent '${tag.code}' (${tag.vendor_code}/${tag.purpose_code})`)
      trigger = Promise.resolve(provider.trigger(tag.vendor_code, tag.purpose_code)).then(() => {
        slot.state = 'loading'
        debug(`consent arrived, load '${tag.code}'`)
        return timing(tag.load)
      })
    }
    else {
      slot.state = 'blocked'
      debug(`blocked '${tag.code}' (${tag.vendor_code}/${tag.purpose_code}) — ${editorContext ? 'editor or preview context' : 'no consent provider and not necessary'}`)
      return
    }
    load(tag, trigger).then(() => {
      slot.state = 'loaded'
      const pending = slot.buffer.splice(0)
      if (pending.length) debug(`'${tag.code}' ready, delivering ${pending.length} buffered event(s)`)
      for (const envelope of pending) {
        // The gate is the moment of the event: buffered events were allowed when they happened.
        deliver(slot, envelope)
      }
    }, (err) => {
      slot.state = 'blocked'
      slot.buffer.length = 0
      logger.warn(LOG_PREFIX, `tag '${tag.code}' failed to load`, err)
    })
  }

  function start(page: { path: string, type?: string }, b2b: boolean | null = null): void {
    for (const slot of slots.values()) {
      if (tagWantedOnPage(slot.tag, page, b2b)) activate(slot)
    }
  }

  function handle(envelope: ThemeEventEnvelope): void {
    if (!envelope || typeof envelope !== 'object' || !envelope.event) return
    // The hook and the DOM event both carry each envelope: deliver it once.
    if (envelope.event_id) {
      if (seen.includes(envelope.event_id)) return
      seen.push(envelope.event_id)
      if (seen.length > SEEN_EVENT_IDS) seen.shift()
    }
    debug(`event '${envelope.event}'`, envelope)

    const b2b = envelope.customer?.b2b ?? null
    for (const slot of slots.values()) {
      const { tag } = slot
      if (envelope.event === 'page_view' && tagWantedOnPage(tag, envelope.page, b2b)) activate(slot)
      else if (tag.triggers.some(t => eventTriggerMatches(t, envelope))) activate(slot)
    }

    // GA4-format copy in the dataLayer for GTM triggers — only when a GTM tag may run.
    if (settings.push_events_to_data_layer) {
      const gtm = [...slots.values()].some(s => s.tag.registry_key === 'googleTagManager' && s.state !== 'idle' && s.state !== 'blocked' && allowed(s.tag))
      if (gtm) pushToDataLayer(w, settings.data_layer_name, envelope.event, envelope, settings.event_price_basis)
    }

    for (const slot of slots.values()) {
      if (!normaliseEntry(slot.tag.event_map?.[envelope.event] as EventMapEntry | string | null | undefined)) continue
      if (slot.state === 'idle' || slot.state === 'blocked') continue
      if (!allowed(slot.tag)) {
        debug(`event '${envelope.event}' withheld from '${slot.tag.code}' — not allowed now`)
        continue
      }
      if (slot.state === 'loaded') {
        deliver(slot, envelope)
        continue
      }
      // Allowed but not ready yet: buffer, oldest dropped beyond fifty.
      slot.buffer.push(envelope)
      if (slot.buffer.length > MAX_BUFFERED_EVENTS) slot.buffer.shift()
    }
  }

  return {
    start,
    handle,
    allowed,
    state: code => slots.get(code)?.state,
    get hosts() {
      return container.hosts
    },
    container,
  }
}
