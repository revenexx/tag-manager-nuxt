/**
 * The registry scripts this module adds to @nuxt/scripts, as data: no Nuxt,
 * no Vue, no side effect, so the package root can export it as a value.
 *
 * When the installed @nuxt/scripts already ships one of these keys, its own
 * entry is used everywhere — registry, auto-import and the tag runtime — and
 * this module's implementation stays unused.
 */
export const ADDED_REGISTRY_SCRIPTS = [
  { registryKey: 'etracker', label: 'etracker', category: 'analytics', file: 'etracker', name: 'useScriptEtracker' },
  { registryKey: 'hubspot', label: 'HubSpot', category: 'marketing', file: 'hubspot', name: 'useScriptHubspot' },
  { registryKey: 'tawkTo', label: 'Tawk.to', category: 'support', file: 'tawk-to', name: 'useScriptTawkTo' },
] as const

export type AddedRegistryKey = typeof ADDED_REGISTRY_SCRIPTS[number]['registryKey']
