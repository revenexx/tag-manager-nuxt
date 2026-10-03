import { defineBuildConfig } from 'unbuild'

// The `events` subpath is a plain library entry next to the module: no Nuxt,
// no Vue, no side effect — @revenexx/cover imports it without installing the module.
export default defineBuildConfig({
  entries: [
    { input: 'src/events', name: 'events' },
  ],
  externals: ['vue', 'nuxt', '#imports', '#app'],
})
