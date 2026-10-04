---
"@revenexx/tag-manager-nuxt": minor
---

First release: loads the published Tag Manager container through `/_tag-manager/container`, gates every marketing tag through the consent provider (`nuxtApp.$consentProvider`), registers etracker, HubSpot and Tawk.to with @nuxt/scripts, maps the theme event contract (theme-events/1) onto vendor calls, and ships the contract's emitter, validator and types at `@revenexx/tag-manager-nuxt/events` and its JSON Schema at `@revenexx/tag-manager-nuxt/contract/theme-events.schema.json` (RAD-181, RAD-178).
