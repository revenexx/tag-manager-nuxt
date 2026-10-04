/**
 * Loads the container (SSR, so `useTagManager().hosts` is there for a CSP) and,
 * in the browser, starts the tag runtime behind the consent provider.
 *
 * Event intake: the `revenexx:event` Nuxt hook (Nuxt modules) and the
 * `revenexx:event` DOM event (theme extensions). The runtime drops the second
 * copy of an envelope by its event_id. Events that arrive before the container
 * is there are held — fifty at most — and replayed in order.
 */
import {
  defineNuxtPlugin,
  useRequestFetch,
  useRuntimeConfig,
  useScript,
  useScriptBingUet,
  useScriptClarity,
  useScriptCrisp,
  useScriptGoogleAnalytics,
  useScriptGoogleTagManager,
  useScriptHotjar,
  useScriptIntercom,
  useScriptLinkedInInsight,
  useScriptMatomoAnalytics,
  useScriptMetaPixel,
  useScriptTikTokPixel,
  useState,
} from '#imports'
import type { Plugin } from '#app'
import type { ThemeEventEnvelope } from './events/types'
import { DEFAULT_EDITOR_HOSTS, DEFAULT_EDITOR_PATHS, isEditorOrPreviewContext } from './core/context'
import { createTagRuntime, LOG_PREFIX, MAX_BUFFERED_EVENTS } from './core/runtime'
import type { TagRuntime } from './core/runtime'
import { browserTiming } from './core/timing'
import type { ConsentProvider, ContainerTag, DeliveredContainer } from './core/types'
import { EMPTY_CONTAINER, isDeliveredContainer } from './core/types'
import { CONTAINER_STATE_KEY } from './composables/useTagManager'
// Build-time values: the container route as registered, and the composable of
// each added registry key — @nuxt/scripts' own where it ships the key, this
// module's otherwise. The same source the registry and auto-imports use.
import { addedRegistry, endpoint } from '#tag-manager/build'

type RegistryComposable = (options: Record<string, unknown>) => { onLoaded: (cb: () => void) => void }

/** Registry key → composable. A key missing here is refused at publish by the app's registry. */
const REGISTRY = {
  ...addedRegistry,
  googleTagManager: useScriptGoogleTagManager,
  googleAnalytics: useScriptGoogleAnalytics,
  metaPixel: useScriptMetaPixel,
  linkedinInsight: useScriptLinkedInInsight,
  bingUet: useScriptBingUet,
  tiktokPixel: useScriptTikTokPixel,
  matomoAnalytics: useScriptMatomoAnalytics,
  hotjar: useScriptHotjar,
  clarity: useScriptClarity,
  intercom: useScriptIntercom,
  crisp: useScriptCrisp,
} as unknown as Record<string, RegistryComposable>

/** Config keys that would write Consent Mode defaults: the consent module owns those, never a tag. */
const CONSENT_DEFAULT_KEYS = ['defaultConsent']

const tagManagerPlugin: Plugin = defineNuxtPlugin({
  name: 'revenexx:tag-manager',
  async setup(nuxtApp) {
    const config = useRuntimeConfig().public.tagManager
    const state = useState<DeliveredContainer>(CONTAINER_STATE_KEY, () => EMPTY_CONTAINER)
    const route = nuxtApp.$router?.currentRoute?.value
    const previewParam = config?.previewParam || 'rvx_tm_preview'
    const previewToken = typeof route?.query?.[previewParam] === 'string' ? route.query[previewParam] as string : null

    let runtime: TagRuntime | null = null
    const early: ThemeEventEnvelope[] = []
    const intake = (envelope: ThemeEventEnvelope) => {
      if (runtime) return runtime.handle(envelope)
      early.push(envelope)
      if (early.length > MAX_BUFFERED_EVENTS) early.shift()
    }
    nuxtApp.hook('revenexx:event', intake)

    // Fetch on the server, and on the client only if SSR did not (an SPA page).
    if (!isDeliveredContainer(state.value)) state.value = EMPTY_CONTAINER
    if (import.meta.server || !state.value.container.version) {
      try {
        const query: Record<string, string> = {}
        if (previewToken) query.preview = previewToken
        const answer = await useRequestFetch()<unknown>(endpoint, { query })
        state.value = isDeliveredContainer(answer) ? answer : EMPTY_CONTAINER
      }
      catch {
        state.value = EMPTY_CONTAINER
      }
    }
    if (import.meta.server) return

    const w = window as unknown as Record<string, any>
    w.addEventListener('revenexx:event', (e: Event) => intake((e as CustomEvent<ThemeEventEnvelope>).detail))

    const debug = Boolean(config?.debug || state.value.container.preview)
    const editorContext = isEditorOrPreviewContext(window.location.hostname, window.location.pathname, {
      hosts: config?.editorHosts ?? DEFAULT_EDITOR_HOSTS,
      paths: config?.editorPaths ?? DEFAULT_EDITOR_PATHS,
    })

    const load = (tag: ContainerTag, trigger: Promise<void>): Promise<void> => {
      const scriptOptions: Record<string, unknown> = { trigger }
      if (!state.value.settings.first_party_mode) scriptOptions.proxy = false
      let instance: { onLoaded: (cb: () => void) => void }
      if (tag.kind === 'script') {
        if (!tag.script_url || !tag.script_url.startsWith('https://')) return Promise.reject(new Error('script tags load over https only'))
        instance = useScript({ src: tag.script_url, key: `rvx-tm-${tag.code}` }, scriptOptions) as never
      }
      else {
        const composable = tag.registry_key ? REGISTRY[tag.registry_key] : undefined
        if (!composable) return Promise.reject(new Error(`unsupported registry key '${tag.registry_key}'`))
        const options = Object.fromEntries(Object.entries(tag.config).filter(([key]) => !CONSENT_DEFAULT_KEYS.includes(key)))
        instance = nuxtApp.runWithContext(() => composable({ ...options, scriptOptions })) as { onLoaded: (cb: () => void) => void }
      }
      return new Promise<void>(resolve => instance.onLoaded(() => resolve()))
    }

    const startRuntime = async () => {
      const provider = (nuxtApp.$consentProvider as ConsentProvider | undefined) ?? null
      if (provider) {
        try {
          await provider.ready
        }
        catch {
          // An unreadable policy is handled by the provider: allows() answers false.
        }
      }
      if (debug) console.log(LOG_PREFIX, provider ? 'consent provider present' : 'no consent provider — necessary tags only', state.value.container)
      runtime = createTagRuntime({
        container: state.value,
        provider,
        editorContext,
        load,
        timing: browserTiming(window),
        w,
        debug,
      })
      ;(nuxtApp as unknown as { _rvxTagRuntime?: TagRuntime })._rvxTagRuntime = runtime
      runtime.start({ path: window.location.pathname })
      for (const envelope of early.splice(0)) runtime.handle(envelope)
    }

    nuxtApp.hook('app:mounted', () => {
      startRuntime().catch(err => console.warn(LOG_PREFIX, 'could not start', err))
    })
  },
})

export default tagManagerPlugin
