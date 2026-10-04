/**
 * A theme's view of the published package: type-checked against the BUILT
 * declarations (`pnpm build && pnpm test:dist`), through the package name and
 * its `exports` map, not against src.
 */
import type { RuntimeConfig } from '@nuxt/schema'
import { ADDED_REGISTRY_SCRIPTS } from '@revenexx/tag-manager-nuxt'
import type {
  AddedRegistryKey, ConsentProvider, ConsentState, ContainerTag, DeliveredContainer, EditorContextOptions,
  ModuleOptions, TagLoadState, TagManagerPublicRuntimeConfig, TagManagerRuntimeConfig, TagRuntime, UseTagManager,
} from '@revenexx/tag-manager-nuxt'

// A value export, not only a type.
export const keys: AddedRegistryKey[] = ADDED_REGISTRY_SCRIPTS.map(s => s.registryKey)

export function provider(p: ConsentProvider, state: ConsentState): boolean {
  return p.allows('google-analytics', 'statistics') && Object.keys(state.purposes).length > 0
}
export function tags(c: DeliveredContainer): ContainerTag[] {
  return c.tags
}
export function stateOf(r: TagRuntime): TagLoadState | undefined {
  return r.state('ga4')
}
export const editor: EditorContextOptions = { hosts: ['*.theme.rvnxx.site'], paths: ['/admin'] }
export const options: Partial<ModuleOptions> = { debug: true, editorPaths: ['/cms'] }
export type Composable = UseTagManager

// The module's runtime config lives under its own key, nowhere else.
declare const config: RuntimeConfig
export const apiKey: string = config.tagManager.apiKey
export const server: TagManagerRuntimeConfig = config.tagManager
export const pub: TagManagerPublicRuntimeConfig = config.public.tagManager
// @ts-expect-error -- not merged into the top level of RuntimeConfig
export const leakedTop: string = config.apiKey
// @ts-expect-error -- not merged into the top level of PublicRuntimeConfig
export const leakedPublic: string = config.public.previewParam
