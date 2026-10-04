# @revenexx/tag-manager-nuxt

## 0.1.1

### Patch Changes

- 65d3a28: Fixes:

  - `apiUrl` may now end in `/v1`: the container route no longer requests `…/v1/v1/…`.
  - Runtime config types: the interfaces are now `TagManagerRuntimeConfig` and `TagManagerPublicRuntimeConfig` and are typed only under `runtimeConfig.tagManager` / `runtimeConfig.public.tagManager`. 0.1.0 named them `ModuleRuntimeConfig`/`ModulePublicRuntimeConfig`, which merged their fields into the top level of `RuntimeConfig`.
  - The package root now exports the documented types (`ConsentProvider`, `ConsentState`, `DeliveredContainer`, `ContainerTag`, `TagRuntime`, `TagLoadState`, `UseTagManager`, `EditorContextOptions`, …) and `ADDED_REGISTRY_SCRIPTS` as a value.
  - `endpoint` is build-time only. It was also exposed as public runtime config, so `NUXT_PUBLIC_TAG_MANAGER_ENDPOINT` moved the client fetch away from the route registered at build time. The plugin now reads the same build-time value the route is registered with.
  - New options `editorHosts` and `editorPaths` (public runtime config), with the consent module's defaults `['*.theme.rvnxx.site']` and `['/admin', '/preview']`, replace the hard-coded editor/preview list.
  - When the installed `@nuxt/scripts` ships its own `etracker`, `hubspot` or `tawkTo` registry entry, that entry's composable is used everywhere, including by the tag runtime. Previously the registry kept upstream's entry while the runtime still called this module's composable.

## 0.1.0

### Minor Changes

- 14c3a10: First release: loads the published Tag Manager container through `/_tag-manager/container`, gates every marketing tag through the consent provider (`nuxtApp.$consentProvider`), registers etracker, HubSpot and Tawk.to with @nuxt/scripts, maps the theme event contract (theme-events/1) onto vendor calls, and ships the contract's emitter, validator and types at `@revenexx/tag-manager-nuxt/events` and its JSON Schema at `@revenexx/tag-manager-nuxt/contract/theme-events.schema.json` (RAD-181, RAD-178).
