import { computed, useNuxtApp, useState } from '#imports'
import type { ComputedRef } from 'vue'
import type { TagRuntime } from '../core/runtime'
import type { DeliveredContainer } from '../core/types'
import { EMPTY_CONTAINER } from '../core/types'

export const CONTAINER_STATE_KEY = 'rvx-tag-manager-container'

export interface UseTagManager {
  /** The container this page runs, as delivered (published, or the draft in preview). */
  container: ComputedRef<DeliveredContainer>
  /**
   * Every third-party host the container's tags may load from or send to —
   * for the theme's Content-Security-Policy `script-src` / `connect-src`.
   * Available during SSR, so a CSP header can be built before the page is sent.
   */
  hosts: ComputedRef<string[]>
  /** Whether this page runs an unpublished draft (`?rvx_tm_preview=`). */
  preview: ComputedRef<boolean>
  /** The client-side runtime, once it has started (null on the server). */
  runtime: () => TagRuntime | null
}

export function useTagManager(): UseTagManager {
  const state = useState<DeliveredContainer>(CONTAINER_STATE_KEY, () => EMPTY_CONTAINER)
  const nuxtApp = useNuxtApp()
  return {
    container: computed(() => state.value),
    hosts: computed(() => state.value.hosts ?? []),
    preview: computed(() => Boolean(state.value.container?.preview)),
    runtime: () => ((nuxtApp as unknown as { _rvxTagRuntime?: TagRuntime })._rvxTagRuntime ?? null),
  }
}
