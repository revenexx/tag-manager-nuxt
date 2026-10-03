/**
 * HubSpot tracking code as a @nuxt/scripts registry script (`hubspot`).
 *
 * `js.hs-scripts.com/{portal}.js` (or `js-eu1.` for an EU-hosted portal) with
 * `id="hs-script-loader"`. Calls go through the `_hsq` queue, which HubSpot
 * processes when the loader arrives. `identify` is never called: the storefront
 * event contract carries no personal data to identify anybody with.
 */
import type { UseScriptContext } from '#nuxt-scripts/types'
import { useRegistryScript } from '#nuxt-scripts/utils'

export interface HubspotOptions {
  /** The portal (hub) id. */
  id: string | number
  /** `eu1` for an EU-hosted portal, otherwise `na1`. */
  region?: 'na1' | 'eu1'
}

export interface HubspotApi {
  _hsq: unknown[]
}

declare global {
  interface Window {
    _hsq?: unknown[]
  }
}

export function useScriptHubspot<T extends HubspotApi>(_options?: HubspotOptions & { scriptOptions?: Record<string, unknown> }): UseScriptContext<T> {
  return useRegistryScript<T, HubspotOptions>('hubspot' as never, options => ({
    scriptInput: {
      src: `https://${options.region === 'eu1' ? 'js-eu1' : 'js'}.hs-scripts.com/${options.id}.js`,
      id: 'hs-script-loader',
      defer: true,
    },
    scriptOptions: {
      use: () => ({ _hsq: window._hsq || [] }) as T,
    },
    clientInit: import.meta.server
      ? undefined
      : () => {
          window._hsq = window._hsq || []
        },
  }), _options as never)
}
