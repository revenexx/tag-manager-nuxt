---
"@revenexx/tag-manager-nuxt": minor
---

First release: loads the published Tag Manager container through `/_tag-manager/container`, gates every marketing tag through the consent provider (`nuxtApp.$consentProvider`), registers etracker, HubSpot and Tawk.to with @nuxt/scripts, maps the theme event contract (theme-events/1) onto vendor calls, and ships the contract itself at `@revenexx/tag-manager-nuxt/events` (RAD-181, RAD-178).
