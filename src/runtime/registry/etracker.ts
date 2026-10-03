/**
 * etracker analytics as a @nuxt/scripts registry script (`etracker`).
 *
 * The loader tag is etracker's own "code 6.0": `id="_etLoader"`, the account
 * in `data-secure-code`, cookieless unless the tenant says otherwise. E-commerce
 * calls are queued on `_etrackerOnReady`, which is how etracker's snippet defers
 * work until e.js has loaded — see the `etracker` adapter for the etCommerce
 * mapping (viewProduct, viewProductList, insertToBasket, removeFromBasket, order).
 */
import type { UseScriptContext } from '#nuxt-scripts/types'
import { useRegistryScript } from '#nuxt-scripts/utils'

export interface EtrackerOptions {
  /** The account's secure code (`data-secure-code`). */
  id: string
  /** `data-block-cookies` — cookieless tracking. Default true. */
  blockCookies?: boolean
  /** `data-respect-dnt` — no requests under Do Not Track. Default true. */
  respectDnt?: boolean
  /** `et_pagename` for the first page; etracker falls back to the document title. */
  pagename?: string
  /** `et_areas`, a `/`-separated hierarchy. */
  areas?: string
}

export interface EtrackerApi {
  etCommerce: { sendEvent: (...args: unknown[]) => void } | undefined
  _etracker: { sendEvent: (event: unknown) => void } | undefined
}

declare global {
  interface Window {
    _etrackerOnReady?: Array<() => void>
    etCommerce?: { sendEvent: (...args: unknown[]) => void }
    _etracker?: { sendEvent: (event: unknown) => void }
    et_pagename?: string
    et_areas?: string
  }
}

export function useScriptEtracker<T extends EtrackerApi>(_options?: EtrackerOptions & { scriptOptions?: Record<string, unknown> }): UseScriptContext<T> {
  return useRegistryScript<T, EtrackerOptions>('etracker' as never, options => ({
    scriptInput: {
      'src': 'https://code.etracker.com/code/e.js',
      'id': '_etLoader',
      'charset': 'UTF-8',
      'data-secure-code': String(options.id),
      'data-block-cookies': String(options.blockCookies ?? true),
      'data-respect-dnt': String(options.respectDnt ?? true),
    },
    scriptOptions: {
      use: () => ({ etCommerce: window.etCommerce, _etracker: window._etracker }) as T,
    },
    clientInit: import.meta.server
      ? undefined
      : () => {
          window._etrackerOnReady = window._etrackerOnReady || []
          if (options.pagename) window.et_pagename = options.pagename
          if (options.areas) window.et_areas = options.areas
        },
  }), _options as never)
}
