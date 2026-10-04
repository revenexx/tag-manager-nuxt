import { addImports, addPlugin, addServerHandler, addTemplate, createResolver, defineNuxtModule, hasNuxtModule, useLogger } from '@nuxt/kit'
import { defu } from 'defu'
import type { ThemeEventEnvelope } from './runtime/events/types'
import type { ConsentProvider } from './runtime/core/types'
import { DEFAULT_EDITOR_HOSTS, DEFAULT_EDITOR_PATHS } from './runtime/core/context'
import { ADDED_REGISTRY_SCRIPTS } from './runtime/registry/scripts'

export type * from './runtime/types'
export * from './runtime/registry/scripts'

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
  /**
   * Path of the Nitro route that serves the container to the app. Build time
   * only: the route is registered when the app is built, so this is not a
   * runtime config value and no environment variable changes it.
   */
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
  /** Hosts that count as editor context: no tag loads. `*.x` matches every subdomain. Default `['*.theme.rvnxx.site']`. */
  editorHosts: string[]
  /** Path prefixes that count as editor/preview context: no tag loads. Default `['/admin', '/preview']`. */
  editorPaths: string[]
}

/** `runtimeConfig.tagManager` — server only. */
export interface TagManagerRuntimeConfig {
  apiUrl: string
  tenant: string
  apiKey: string
}

/** `runtimeConfig.public.tagManager`. */
export interface TagManagerPublicRuntimeConfig {
  marketCookie: string
  previewParam: string
  debug: boolean
  editorHosts: string[]
  editorPaths: string[]
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
    tagManager: TagManagerRuntimeConfig
  }
  interface PublicRuntimeConfig {
    tagManager: TagManagerPublicRuntimeConfig
  }
}

interface RegistryImport { name: string, from: string }

/** The build-time values the plugin reads: the route path and where each added registry composable comes from. */
function buildTemplate(endpoint: string, sources: Record<string, RegistryImport>): string {
  const keys = Object.keys(sources)
  return [
    ...keys.map((key, i) => `import { ${sources[key]!.name} as _r${i} } from ${JSON.stringify(sources[key]!.from)}`),
    `export const endpoint = ${JSON.stringify(endpoint)}`,
    `export const addedRegistry = { ${keys.map((key, i) => `${JSON.stringify(key)}: _r${i}`).join(', ')} }`,
    '',
  ].join('\n')
}

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
    editorHosts: DEFAULT_EDITOR_HOSTS,
    editorPaths: DEFAULT_EDITOR_PATHS,
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
    // A key @nuxt/scripts already ships keeps its own entry, and then ITS
    // composable is the one the tag runtime calls too: one source per key.
    const sources: Record<string, RegistryImport> = Object.fromEntries(ADDED_REGISTRY_SCRIPTS.map(s => [
      s.registryKey, { name: s.name, from: resolve(`./runtime/registry/${s.file}`) },
    ]))
    nuxt.hook('scripts:registry' as never, ((registry: Array<Record<string, unknown>>) => {
      for (const script of ADDED_REGISTRY_SCRIPTS) {
        const existing = registry.find(r => r.registryKey === script.registryKey)
        const upstream = existing?.import as RegistryImport | undefined
        if (existing) {
          if (upstream?.name && upstream.from) sources[script.registryKey] = { name: upstream.name, from: upstream.from }
          continue
        }
        registry.push({
          registryKey: script.registryKey,
          label: script.label,
          category: script.category,
          import: sources[script.registryKey],
        })
      }
    }) as never)

    // Read when the templates are written, after modules:done has run the hook above.
    const template = addTemplate({
      filename: 'tag-manager/build.mjs',
      write: true,
      getContents: () => buildTemplate(options.endpoint, sources),
    })
    addTemplate({
      filename: 'tag-manager/build.d.mts',
      write: true,
      getContents: () => [
        'type RegistryComposable = (options: Record<string, unknown>) => { onLoaded: (cb: () => void) => void }',
        'export declare const endpoint: string',
        'export declare const addedRegistry: Record<string, RegistryComposable>',
        '',
      ].join('\n'),
    })
    nuxt.options.alias['#tag-manager/build'] = template.dst

    nuxt.options.runtimeConfig.tagManager = defu(nuxt.options.runtimeConfig.tagManager, {
      apiUrl: options.apiUrl,
      tenant: options.tenant,
      apiKey: options.apiKey,
    })
    nuxt.options.runtimeConfig.public.tagManager = defu(nuxt.options.runtimeConfig.public.tagManager, {
      marketCookie: options.marketCookie,
      previewParam: options.previewParam,
      debug: options.debug,
      editorHosts: options.editorHosts,
      editorPaths: options.editorPaths,
    })

    addServerHandler({
      route: options.endpoint,
      method: 'get',
      handler: resolve('./runtime/server/routes/container.get'),
    })
    addPlugin(resolve('./runtime/plugin'))
    // The added registry composables are auto-imported by @nuxt/scripts from
    // their registry entries — not here, so a key it ships itself is not
    // imported twice under one name.
    addImports({ name: 'useTagManager', from: resolve('./runtime/composables/useTagManager') })
  },
})
