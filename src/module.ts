import { addImports, addPlugin, addServerHandler, createResolver, defineNuxtModule, hasNuxtModule, useLogger } from '@nuxt/kit'
import { defu } from 'defu'
import type { ThemeEventEnvelope } from './runtime/events/types'
import type { ConsentProvider } from './runtime/core/types'

/**
 * `@revenexx/tag-manager-nuxt`
 *
 * Loads the tag container the revenexx Tag Manager app published, registers
 * each marketing tag with @nuxt/scripts behind the visitor's consent, and maps
 * the theme event contract (`revenexx:event`, theme-events/1) onto
 * each vendor's own calls.
 *
 *   modules: ['@nuxt/scripts', '@revenexx/consent-manager-nuxt', '@revenexx/tag-manager-nuxt']
 *
 * The only coupling to the consent module is `nuxtApp.$consentProvider`
 * (SHARED-CONTRACT). Without it only tags under the `necessary` purpose load.
 */
export interface ModuleOptions {
  /** Turn the module off without removing it. */
  enabled: boolean
  /** Path of the Nitro route that serves the container to the app. */
  endpoint: string
  /** Gateway base URL. Runtime: NUXT_TAG_MANAGER_API_URL. */
  apiUrl: string
  /** Fallback tenant when no brokered context arrives (local dev). Runtime: NUXT_TAG_MANAGER_TENANT. */
  tenant: string
  /** Fallback gateway key, server-side only (local dev). Runtime: NUXT_TAG_MANAGER_API_KEY. */
  apiKey: string
  /** Cookie that carries the active market code. `cover-market` in @revenexx/cover. */
  marketCookie: string
  /** Query parameter that turns on preview of the unpublished draft. */
  previewParam: string
  /** Log every decision and event to the console, as preview mode does. */
  debug: boolean
}

export interface ModuleRuntimeConfig {
  apiUrl: string
  tenant: string
  apiKey: string
}

export interface ModulePublicRuntimeConfig {
  endpoint: string
  marketCookie: string
  previewParam: string
  debug: boolean
}

declare module '#app' {
  interface RuntimeNuxtHooks {
    'revenexx:event': (envelope: ThemeEventEnvelope) => void | Promise<void>
  }
  interface NuxtApp {
    $consentProvider?: ConsentProvider
  }
}

declare module '@nuxt/schema' {
  interface RuntimeConfig {
    tagManager: ModuleRuntimeConfig
  }
  interface PublicRuntimeConfig {
    tagManager: ModulePublicRuntimeConfig
  }
}

/** Registry scripts this module adds to @nuxt/scripts. */
export const ADDED_REGISTRY_SCRIPTS = [
  { registryKey: 'etracker', label: 'etracker', category: 'analytics', file: 'etracker', name: 'useScriptEtracker' },
  { registryKey: 'hubspot', label: 'HubSpot', category: 'marketing', file: 'hubspot', name: 'useScriptHubspot' },
  { registryKey: 'tawkTo', label: 'Tawk.to', category: 'support', file: 'tawk-to', name: 'useScriptTawkTo' },
] as const

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@revenexx/tag-manager-nuxt',
    configKey: 'tagManager',
    compatibility: { nuxt: '>=4.0.0' },
  },
  defaults: {
    enabled: true,
    endpoint: '/_tag-manager/container',
    apiUrl: 'https://api.revenexx.com',
    tenant: '',
    apiKey: '',
    marketCookie: 'cover-market',
    previewParam: 'rvx_tm_preview',
    debug: false,
  },
  setup(options, nuxt) {
    const logger = useLogger('tag-manager')
    if (!options.enabled) return
    const { resolve } = createResolver(import.meta.url)

    if (!hasNuxtModule('@nuxt/scripts', nuxt)) {
      logger.warn('@revenexx/tag-manager-nuxt builds on @nuxt/scripts — add \'@nuxt/scripts\' to `modules` before it, or no tag will load.')
    }

    // etracker, HubSpot and Tawk.to are not in the @nuxt/scripts registry (1.3.x):
    // add them the way a Nuxt Image provider is added — as a registry entry.
    nuxt.hook('scripts:registry' as never, ((registry: Array<Record<string, unknown>>) => {
      for (const script of ADDED_REGISTRY_SCRIPTS) {
        if (registry.some(r => r.registryKey === script.registryKey)) continue
        registry.push({
          registryKey: script.registryKey,
          label: script.label,
          category: script.category,
          import: { name: script.name, from: resolve(`./runtime/registry/${script.file}`) },
        })
      }
    }) as never)

    nuxt.options.runtimeConfig.tagManager = defu(nuxt.options.runtimeConfig.tagManager, {
      apiUrl: options.apiUrl,
      tenant: options.tenant,
      apiKey: options.apiKey,
    })
    nuxt.options.runtimeConfig.public.tagManager = defu(nuxt.options.runtimeConfig.public.tagManager, {
      endpoint: options.endpoint,
      marketCookie: options.marketCookie,
      previewParam: options.previewParam,
      debug: options.debug,
    })

    addServerHandler({
      route: options.endpoint,
      method: 'get',
      handler: resolve('./runtime/server/routes/container.get'),
    })
    addPlugin(resolve('./runtime/plugin'))
    addImports([
      { name: 'useTagManager', from: resolve('./runtime/composables/useTagManager') },
      // The registry composables this module adds, so a theme can also call them directly.
      ...ADDED_REGISTRY_SCRIPTS.map(s => ({ name: s.name, from: resolve(`./runtime/registry/${s.file}`) })),
    ])
  },
})
