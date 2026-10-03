/**
 * `@revenexx/tag-manager-nuxt/events` — the theme event contract, usable
 * without the Tag Manager module. No Nuxt or Vue import, no side effect.
 */
export * from './vocabulary'
export type * from './types'
export { validateThemeEvent, assertThemeEvent } from './validate'
export { createThemeEvents, scrubThemeEvent } from './emitter'
export type { ThemeEvents, ThemeEventsOptions, StorageLike } from './emitter'
