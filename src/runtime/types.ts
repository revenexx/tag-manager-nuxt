/**
 * The public types of the package root. Everything here is part of the
 * documented API; the rest of the runtime directory is not.
 */
export type {
  ConsentDecision, ConsentProvider, ConsentState, ContainerTag, ContainerTrigger, ContainerVariable,
  DeliveredContainer, EventMapEntry, LoadTiming, PriceBasis, TagManagerSettings, TriggerConditions,
} from './core/types'
export type { TagLoadState, TagLoader, TagRuntime } from './core/runtime'
export type { EditorContextOptions } from './core/context'
export type { UseTagManager } from './composables/useTagManager'
export type { AddedRegistryKey } from './registry/scripts'
