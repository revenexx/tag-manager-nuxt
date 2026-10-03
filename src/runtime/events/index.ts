/**
 * `@revenexx/tag-manager-nuxt/events` — the storefront event contract, usable
 * without the Tag Manager module. No Nuxt or Vue import, no side effect.
 */
export * from './vocabulary'
export type * from './types'
export { validateStorefrontEvent, assertStorefrontEvent } from './validate'
export { createStorefrontEvents, scrubStorefrontEvent } from './emitter'
export type { StorefrontEvents, StorefrontEventsOptions, StorageLike } from './emitter'
