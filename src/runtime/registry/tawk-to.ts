/**
 * Tawk.to chat widget as a @nuxt/scripts registry script (`tawkTo`).
 *
 * @nuxt/scripts 1.3.x ships no Tawk.to entry, so this module registers one; the
 * `scripts:registry` hook skips it when a newer @nuxt/scripts brings its own.
 */
import type { UseScriptContext } from '#nuxt-scripts/types'
import { useRegistryScript } from '#nuxt-scripts/utils'

export interface TawkToOptions {
  propertyId: string
  widgetId: string
}

export interface TawkToApi {
  Tawk_API: Record<string, unknown>
}

declare global {
  interface Window {
    Tawk_API?: Record<string, unknown>
    Tawk_LoadStart?: Date
  }
}

export function useScriptTawkTo<T extends TawkToApi>(_options?: TawkToOptions & { scriptOptions?: Record<string, unknown> }): UseScriptContext<T> {
  return useRegistryScript<T, TawkToOptions>('tawkTo' as never, options => ({
    scriptInput: {
      src: `https://embed.tawk.to/${options.propertyId}/${options.widgetId}`,
      crossorigin: 'anonymous',
    },
    scriptOptions: {
      use: () => ({ Tawk_API: window.Tawk_API || {} }) as T,
    },
    clientInit: import.meta.server
      ? undefined
      : () => {
          window.Tawk_API = window.Tawk_API || {}
          window.Tawk_LoadStart = new Date()
        },
  }), _options as never)
}
