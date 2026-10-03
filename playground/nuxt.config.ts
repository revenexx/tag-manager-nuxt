// A storefront stand-in: @nuxt/scripts, a fake consent provider (plugins/), and this module.
export default defineNuxtConfig({
  modules: ['@nuxt/scripts', '../src/module'],
  devtools: { enabled: true },
  compatibilityDate: '2026-10-01',
  tagManager: {
    debug: true,
  },
})
